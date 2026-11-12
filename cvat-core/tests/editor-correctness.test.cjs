// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { transformSync } = require('@babel/core');

// Load the real annotation models without a browser or an API server.
function editor() {
    const modules = new Map();
    function load(filename) {
        if (modules.has(filename)) return modules.get(filename).exports;
        const module = { exports: {} };
        modules.set(filename, module);
        const source = transformSync(readFileSync(filename, 'utf8'), {
            filename,
            configFile: path.resolve(__dirname, '../babel.config.json'),
            babelrc: false,
        }).code;
        const localRequire = createRequire(filename);
        const execute = vm.runInThisContext(`(function(require, module, exports) { ${source}\n})`, { filename });
        execute((name) => {
            if (name.startsWith('.')) {
                const target = path.resolve(path.dirname(filename), name);
                const resolved = [target, `${target}.ts`, `${target}.js`, `${target}/index.ts`]
                    .find((candidate) => existsSync(candidate) && path.extname(candidate));
                return load(resolved);
            }
            return localRequire(name);
        }, module, module.exports);
        return module.exports;
    }
    const core = (name) => load(path.resolve(__dirname, `../src/${name}.ts`));
    const { Label } = core('labels');
    // Skeleton SVG rendering is outside these model tests; retain actual label/attribute parsing.
    Label.parseUntrustedSvg = () => ({});
    const { default: Collection } = core('annotations-collection');
    const { default: History } = core('annotations-history');
    const { default: ObjectState } = core('object-state');
    const { default: config } = core('config');
    const canvas = load(path.resolve(__dirname, '../../cvat-canvas/src/typescript/canvasModel.ts'));
    const history = new History();
    const label = new Label({ id: 1, name: 'object', color: '#ffffff', type: 'any', attributes: [] });
    const attribute = (id, mutable) => ({
        id, name: `attribute ${id}`, mutable, input_type: 'text', default_value: '', values: [],
    });
    const skeleton = new Label({
        id: 2, name: 'skeleton', type: 'skeleton', color: '#ffffff',
        attributes: [attribute(10, false)],
        sublabels: [{ id: 3, name: 'joint', type: 'points', color: '#ffffff',
            attributes: [attribute(20, false), attribute(21, true)] }],
    });
    const collection = new Collection({
        labels: [label, skeleton], history, stopFrame: 2, dimension: '2d', jobType: 'annotation',
        framesInfo: { 0: { width: 100, height: 100 }, 1: { width: 100, height: 100 },
            2: { width: 100, height: 100 }, isFrameDeleted: () => false },
    });
    const shape = (type, points, extra = {}) => ({
        type, points, frame: 0, label_id: 1, attributes: [], group: 0, source: 'manual',
        z_order: 0, rotation: 0, occluded: false, outside: false, ...extra,
    });
    const states = () => collection.get(0, false, []);
    return { collection, history, config, shape, states, ObjectState, canvas, rle: core('rle-utils') };
}

test('mask-to-box covers every foreground pixel without including empty padding', () => {
    const { rle: { rle2Box, mask2Rle } } = editor();
    const convert = (pixels, width, height, left = 13, top = 29) => rle2Box([
        ...mask2Rle(pixels), left, top, left + width - 1, top + height - 1,
    ]);
    assert.equal(convert(Array(15).fill(0), 5, 3), null);
    assert.deepEqual(convert([1], 1, 1), [13, 29, 14, 30]);
    assert.deepEqual(convert([
        0, 0, 0, 0, 0,
        0, 1, 1, 0, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 0, 0,
    ], 5, 4), [14, 30, 17, 32]);
    // A foreground run that crosses a row boundary occupies both horizontal extremes.
    assert.deepEqual(convert([0, 0, 0, 1, 1, 1, 0, 0], 4, 2), [13, 29, 17, 31]);
    assert.deepEqual(convert(Array(6).fill(1), 3, 2, 0, 0), [0, 0, 3, 2]);
});

test('bulk lock/hide undo and redo restore all supported states and skeleton children in one step', async () => {
    for (const property of ['lock', 'hidden']) {
        const { collection, history, shape, states } = editor();
        collection.import({
            shapes: [shape('rectangle', [10, 10, 20, 20]), shape('skeleton', [], {
                label_id: 2, elements: [shape('points', [30, 30], { label_id: 3 })],
            })],
            tracks: [{ frame: 0, label_id: 1, group: 0, source: 'manual', attributes: [],
                shapes: [shape('rectangle', [40, 40, 60, 60])] }],
            tags: [{ frame: 0, label_id: 1, group: 0, source: 'manual', attributes: [] }],
        });
        history.clear();
        const before = states();
        before.forEach((state) => { state[property] = true; });
        collection.bulkSave(before);
        assert.equal(history.get().undo.length, 1);
        const check = (value) => states().forEach((state) => {
            // Tags support locking but deliberately have no hidden state.
            assert.equal(state[property], property === 'hidden' && state.objectType === 'tag' ? false : value);
            state.elements.forEach((element) => assert.equal(element[property], value));
        });
        check(true);
        await history.undo(1);
        check(false);
        await history.redo(1);
        check(true);
        collection.bulkSave([]);
        collection.bulkSave(states());
        assert.equal(history.get().undo.length, 1, 'no-op saves must not create history');
    }
});

test('copying a skeleton track preserves distinct parent and mutable/immutable joint attributes', () => {
    const { collection, states, ObjectState } = editor();
    collection.import({ tracks: [{
        frame: 0, label_id: 2, group: 0, source: 'manual',
        attributes: [{ spec_id: 10, value: 'parent' }],
        shapes: [{ frame: 0, type: 'skeleton', points: [], attributes: [], z_order: 0,
            outside: false, occluded: false, rotation: 0 }],
        elements: [{ frame: 0, label_id: 3, group: 0, source: 'manual',
            attributes: [{ spec_id: 20, value: 'immutable joint' }],
            shapes: [{ frame: 0, type: 'points', points: [30, 30], z_order: 0, outside: false,
                occluded: false, rotation: 0, attributes: [{ spec_id: 21, value: 'mutable joint' }] }] }],
    }] });
    const [original] = states();
    const copy = (state) => ({
        objectType: state.objectType, shapeType: state.shapeType, frame: state.frame,
        label: state.label, attributes: state.attributes, points: state.points,
        outside: state.outside, occluded: state.occluded, rotation: state.rotation, zOrder: state.zOrder,
        elements: state.elements.map(copy),
    });
    collection.put([new ObjectState(copy(original))]);
    const copied = collection.export().tracks.at(-1);
    assert.deepEqual(copied.attributes, [{ spec_id: 10, value: 'parent' }]);
    assert.deepEqual(copied.elements[0].attributes, [{ spec_id: 20, value: 'immutable joint' }]);
    assert.deepEqual(copied.elements[0].shapes[0].attributes, [{ spec_id: 21, value: 'mutable joint' }]);
});

test('a mask dragged completely outside the image is restored without adding undo history', () => {
    const { collection, history, shape, states } = editor();
    collection.import({ shapes: [shape('mask', [0, 4, 10, 10, 11, 11])] });
    const [state] = states();
    state.points = [0, 4, 110, 10, 111, 11];
    collection.bulkSave([state]);
    assert.deepEqual(states()[0].points, [0, 4, 10, 10, 11, 11]);
    assert.equal(history.get().undo.length, 0);
});

test('dragging masks, including cropped drags, never removes underlying pixels; redraw still does', async () => {
    for (const destination of [[10, 10, 11, 11], [99, 10, 100, 11]]) {
        const { collection, history, config, shape, states } = editor();
        let emptyCount = 0;
        collection.import({ shapes: [shape('mask', [0, 4, 10, 10, 11, 11]),
            shape('mask', [0, 4, 99, 10, 100, 11]), shape('mask', [0, 4, 30, 30, 31, 31])] });
        config.removeUnderlyingMaskPixels.enabled = true;
        config.removeUnderlyingMaskPixels.onEmptyMaskOccurrence = () => { emptyCount++; };
        const moving = states().at(-1);
        const initial = moving.points;
        moving.points = [0, 4, ...destination];
        collection.bulkSave([moving]);
        assert.equal(states().length, 3);
        assert.equal(emptyCount, 0);
        await history.undo(1);
        assert.deepEqual(states().at(-1).points, initial);
        await history.redo(1);
        assert.equal(states().length, 3);
        const redrawn = states().at(-1);
        redrawn.points = [0, 9, 9, 9, 11, 11];
        collection.bulkSave([redrawn]);
        assert.equal(states().length, 2, 'redraw must still remove covered masks');
        assert.equal(emptyCount, 1);
        await history.undo(1);
        assert.equal(states().length, 3);
    }
});

test('re-entering mask editing is idempotent but tool/configuration changes still notify', () => {
    const { canvas: { CanvasModelImpl, Mode } } = editor();
    const model = new CanvasModelImpl();
    const state = { clientID: 1, shapeType: 'mask' };
    let notifications = 0;
    model.subscribe({ notify: () => { notifications++; } });
    model.edit({ enabled: true, state, brushTool: { type: 'brush', size: 10 } });
    model.mode = Mode.EDIT;
    const original = model.editData;
    model.edit({ enabled: true, state });
    assert.equal(notifications, 1);
    assert.deepEqual(model.editData, original);
    model.edit({ enabled: true, state, brushTool: { type: 'eraser', size: 20 } });
    assert.equal(notifications, 2);
    assert.equal(model.editData.brushTool.type, 'eraser');
    model.edit({ enabled: true, state, onUpdateConfiguration() {} });
    assert.equal(notifications, 3);
    assert.throws(() => model.edit({ enabled: true, state: { ...state, clientID: 2 } }));
});
