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
function editor(frameNumbers = [0, 1, 2], { deleted = [], dimension = '2d' } = {}) {
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
    const attribute = (id, mutable) => ({
        id, name: `attribute ${id}`, mutable, input_type: 'text', default_value: '', values: [],
    });
    const label = new Label({ id: 1, name: 'object', color: '#ffffff', type: 'any',
        attributes: [attribute(1, true)] });
    const skeleton = new Label({
        id: 2, name: 'skeleton', type: 'skeleton', color: '#ffffff',
        attributes: [attribute(10, false)],
        sublabels: [{ id: 3, name: 'joint', type: 'points', color: '#ffffff',
            attributes: [attribute(20, false), attribute(21, true)] }],
    });
    const collection = new Collection({
        labels: [label, skeleton], history, stopFrame: frameNumbers.at(-1), dimension, jobType: 'annotation',
        framesInfo: { ...Object.fromEntries(frameNumbers.map((frame) => [frame, { width: 100, height: 100 }])),
            isFrameDeleted: (frame) => deleted.includes(frame) },
    });
    const shape = (type, points, extra = {}) => ({
        type, points, frame: 0, label_id: 1, attributes: [], group: 0, source: 'manual',
        z_order: 0, rotation: 0, occluded: false, outside: false, ...extra,
    });
    const states = () => collection.get(0, false, []);
    return { collection, history, config, shape, states, ObjectState, label, skeleton, canvas, rle: core('rle-utils') };
}

test('near-duplicate source preferences preview without mutation and commit one undoable removal', async () => {
    for (const source of ['manual', 'auto', 'semi-auto']) {
        const { collection, history, shape } = editor();
        collection.import({ shapes: ['manual', 'auto', 'semi-auto', source].map((value, index) => (
            shape('rectangle', [10, 10, 30, 30], { id: index + 1, source: value })
        )) });
        const options = { from: 0, to: 2, labelIDs: [], iouThreshold: 0.9, keep: { source } };
        const before = collection.export();
        const ids = collection.removeDuplicateRectangles(options);
        assert.equal(ids.length, 2);
        assert.deepEqual(collection.export(), before, 'preview must not mutate annotations');
        collection.removeDuplicateRectangles(options, ids);
        assert.deepEqual(collection.export().shapes.map((item) => item.source), [source, source],
            'keep every preferred box, without arbitrary tie breaking');
        const after = collection.export();
        await history.undo(1);
        // CVAT invalidates server IDs on removal so a later undo/save can recreate deleted objects.
        const withoutServerIDs = (data) => data.shapes.map(({ id, ...item }) => item);
        assert.deepEqual(withoutServerIDs(collection.export()), withoutServerIDs(before));
        await history.redo(1);
        assert.deepEqual(collection.export(), after);
        const reloaded = editor().collection;
        reloaded.import(after);
        assert.deepEqual(reloaded.export().shapes.map((item) => item.id), after.shapes.map((item) => item.id));
        assert.deepEqual(collection.removeDuplicateRectangles(options), [], 'a second run is a no-op');
    }
});

test('near-duplicates require direct overlap with a survivor, same class/frame, and an inclusive IoU threshold', () => {
    const { collection, shape } = editor();
    collection.import({ shapes: [
        shape('rectangle', [0, 0, 10, 10], { id: 1, source: 'auto' }),
        shape('rectangle', [1, 0, 11, 10], { id: 2 }),
        shape('rectangle', [2, 0, 12, 10], { id: 3 }),
        shape('rectangle', [0, 0, 10, 10], { id: 4, frame: 1 }),
        shape('rectangle', [0, 0, 10, 10], { id: 5, label_id: 2 }),
        shape('rectangle', [50, 50, 60, 60], { id: 6 }),
    ] });
    const options = { from: 0, to: 2, labelIDs: [], iouThreshold: 9 / 11, keep: { source: 'auto' } };
    assert.deepEqual(collection.removeDuplicateRectangles({ ...options, iouThreshold: 9 / 11 + 0.00001 }), []);
    assert.deepEqual(collection.removeDuplicateRectangles({ ...options, from: 1 }), []);
    assert.deepEqual(collection.removeDuplicateRectangles({ ...options, labelIDs: [2] }), []);
    const ids = collection.removeDuplicateRectangles(options);
    assert.equal(ids.length, 1, 'B matches A, but C only matches B and must survive');
    collection.removeDuplicateRectangles(options, ids);
    assert.deepEqual(collection.export().shapes.map((item) => item.id), [1, 3, 5, 6, 4]);
    for (const iouThreshold of [NaN, 0, 0.49, 1.01]) {
        assert.throws(() => collection.removeDuplicateRectangles({ ...options, iouThreshold }));
    }
    assert.throws(() => collection.removeDuplicateRectangles({ ...options, from: 2, to: 1 }));
});

test('near-duplicate removal preserves protected objects and rejects a stale preview', () => {
    const { collection, shape } = editor([0, 1, 2], { deleted: [1] });
    collection.import({ shapes: [
        shape('rectangle', [0, 0, 10, 10], { id: 1, source: 'auto' }),
        ...[
            {}, { rotation: 20 }, { occluded: true }, { group: 1 },
            { attributes: [{ spec_id: 1, value: 'important' }] }, { descriptions: ['reviewed'] },
            { source: 'file' }, { source: 'Ground truth' }, { source: 'consensus' },
            { outside: true }, {}, {}, { frame: 1 },
        ].map((extra, index) => shape('rectangle', [0, 0, 10, 10], { id: index + 2, ...extra })),
        shape('rectangle', [0, 0, 10, 10], { id: 15, frame: 1, source: 'auto' }),
    ], tracks: [{ frame: 0, label_id: 1, group: 0, source: 'manual', attributes: [],
        shapes: [shape('rectangle', [0, 0, 10, 10])] }] });
    const state = collection.get(0, false, []).find((item) => item.serverID === 12);
    state.lock = true;
    collection.bulkSave([state]);
    const hidden = collection.get(0, false, []).find((item) => item.serverID === 13);
    hidden.hidden = true;
    collection.bulkSave([hidden]);
    const options = { from: 0, to: 2, labelIDs: [], iouThreshold: 0.9, keep: { source: 'auto' } };
    const ids = collection.removeDuplicateRectangles(options);
    assert.equal(ids.length, 1);
    const survivor = collection.get(0, false, []).find((item) => item.serverID === 1);
    survivor.lock = true;
    collection.bulkSave([survivor]);
    const before = collection.export();
    assert.throws(() => collection.removeDuplicateRectangles(options, ids), /Preview again/);
    assert.deepEqual(collection.export(), before, 'stale previews cannot partially delete');
    assert.deepEqual(collection.removeDuplicateRectangles(options), [], 'locked survivors cannot justify deletion');
    assert.throws(() => editor([0, 1], { dimension: '3d' }).collection.removeDuplicateRectangles(options));
});

test('attribute preference matches exact class-specific values, including defaults, without source priority', () => {
    const { collection, shape } = editor();
    collection.import({ shapes: [
        shape('rectangle', [0, 0, 10, 10], { id: 1, attributes: [{ spec_id: 1, value: 'yes' }] }),
        shape('rectangle', [0, 0, 10, 10], { id: 2, source: 'auto', attributes: [{ spec_id: 1, value: 'YES' }] }),
        shape('rectangle', [0, 0, 10, 10], { id: 3, source: 'semi-auto' }),
        shape('rectangle', [0, 0, 10, 10], { id: 4, label_id: 2 }),
    ] });
    const options = { from: 0, to: 0, labelIDs: [], iouThreshold: 1, keep: { attributeID: 1, value: 'yes' } };
    assert.deepEqual(collection.removeDuplicateRectangles({ ...options, keep: { source: 'manual' } }), [],
        'source preference must not discard conflicting attribute values');
    assert.equal(collection.removeDuplicateRectangles({ ...options, keep: { attributeID: 1, value: '' } }).length, 2,
        'the default empty value is a real preference');
    assert.deepEqual(collection.removeDuplicateRectangles({ ...options, keep: { attributeID: 1, value: 'absent' } }), []);
    assert.throws(() => collection.removeDuplicateRectangles({ ...options, keep: { attributeID: 999, value: '' } }));
    const ids = collection.removeDuplicateRectangles(options);
    collection.removeDuplicateRectangles(options, ids);
    assert.deepEqual(collection.export().shapes.map((item) => item.id), [1, 4]);
});

test('annotation tools combine class/source selections with inclusive ranges and preserve unmatched objects', () => {
    const { collection, shape } = editor([0, 1, 2, 3, 4]);
    const tags = [
        { id: 1, frame: 1, label_id: 1, source: 'auto' },
        { id: 2, frame: 3, label_id: 2, source: 'semi-auto' },
        { id: 3, frame: 2, label_id: 1, source: 'manual' },
        { id: 4, frame: 0, label_id: 1, source: 'auto' },
        { id: 5, frame: 4, label_id: 2, source: 'semi-auto' },
    ].map((tag) => ({ ...tag, group: 0, attributes: [] }));
    collection.import({ tags, shapes: tags.filter((tag) => tag.label_id === 1)
        .map((tag) => shape('rectangle', [10, 10, 30, 30], tag)) });
    collection.clear({ from: 1, to: 3, labelIDs: [1, 2], sources: ['auto', 'semi-auto'] });
    assert.deepEqual(collection.export().tags.map((tag) => tag.id), [4, 3, 5]);
    assert.deepEqual(collection.export().shapes.map((object) => object.id), [4, 3]);
    assert.equal(collection.get(1, false, []).length, 0);
    collection.clear({ labelIDs: [2], sources: ['manual'] });
    assert.equal(collection.export().tags.length, 3, 'class and source must both match');
    collection.clear({ labelIDs: [1] });
    assert.deepEqual(collection.export().tags.map((tag) => tag.id), [5]);
    assert.equal(collection.export().shapes.length, 0);
    collection.clear({ sources: ['semi-auto'] });
    assert.equal(collection.export().tags.length, 0, 'source-only deletion works without a frame range');
});

test('annotation tools retain track range semantics and filter keyframes by the parent source', () => {
    const { collection, shape } = editor([0, 1, 2, 3, 4]);
    collection.import({ tracks: [
        { id: 1, frame: 0, source: 'auto' },
        { id: 2, frame: 1, source: 'auto' },
        { id: 3, frame: 1, source: 'manual' },
        { id: 4, frame: 3, source: 'semi-auto' },
    ].map((track) => ({
        ...track, label_id: 1, group: 0, attributes: [],
        shapes: [track.frame, 4].map((frame) => shape('rectangle', [10, 10, 30, 30], { frame })),
    })) });
    collection.clear({ from: 1, to: 3, sources: ['auto', 'semi-auto'] });
    assert.deepEqual(collection.export().tracks.map((track) => track.id), [1, 3]);
    collection.clear({ from: 0, to: 1, labelIDs: [1], sources: ['auto'], delTrackKeyframesOnly: true });
    assert.deepEqual(collection.export().tracks.map((track) => track.shapes.map((item) => item.frame)), [[4], [1, 4]]);
    const reloaded = editor([0, 1, 2, 3, 4]).collection;
    reloaded.import(collection.export());
    assert.deepEqual(reloaded.export().tracks.map((track) => ({
        id: track.id, source: track.source, frames: track.shapes.map((item) => item.frame),
    })), [{ id: 1, source: 'auto', frames: [4] }, { id: 3, source: 'manual', frames: [1, 4] }],
    'filtered deletion survives serialization');
    collection.clear({ from: 4, to: 4, sources: ['auto'], delTrackKeyframesOnly: true });
    assert.deepEqual(collection.export().tracks.map((track) => track.id), [3], 'empty tracks are removed');
    collection.clear({ to: 1, sources: ['manual'] });
    assert.equal(collection.export().tracks.length, 0, 'an omitted lower bound includes the start of the job');
});

test('reverse tracks extend toward the job start, retain their upper boundary, and survive reload and undo', async () => {
    const { collection, history, ObjectState, label } = editor([50, 53, 57, 60, 63]);
    collection.put([new ObjectState({ objectType: 'track', shapeType: 'rectangle', label,
        frame: 60, points: [10, 10, 30, 30] })], true);
    const at = (frame) => collection.get(frame, false, []).filter((object) => !object.outside);
    assert.equal(at(50).length, 1);
    assert.equal(at(57).length, 1);
    assert.equal(at(63).length, 0, 'the seed must not extend into higher frames');
    const initial = collection.export();
    const [state] = at(57);
    state.points = [15, 15, 25, 25];
    collection.bulkSave([state], true);
    assert.deepEqual(at(50)[0].points, [15, 15, 25, 25], 'the unannotated lower tail follows the edit');
    assert.deepEqual(at(60)[0].points, [10, 10, 30, 30], 'the earlier placement in annotation order stays intact');
    await history.undo(1);
    assert.deepEqual(collection.export(), initial);
    await history.redo(1);
    const saved = collection.export();
    const reloaded = editor([50, 53, 57, 60, 63]).collection;
    reloaded.import(saved);
    assert.deepEqual(reloaded.get(50, false, [])[0].points, [15, 15, 25, 25]);
    assert.equal(reloaded.get(63, false, []).filter((object) => !object.outside).length, 0);
    const [finished] = at(53);
    finished.outside = true;
    collection.bulkSave([finished], true);
    assert.equal(at(50).length, 0);
    assert.equal(at(53).filter((object) => !object.outside).length, 0);
    assert.equal(at(57).filter((object) => !object.outside).length, 1);
    await history.undo(1);
    assert.deepEqual(collection.export(), saved);
});

test('backward annotation search returns the nearest interpolated visible frame', () => {
    const { collection, shape } = editor();
    collection.import({ tracks: [{ frame: 0, label_id: 1, group: 0, source: 'manual', attributes: [],
        shapes: [shape('rectangle', [10, 10, 30, 30]),
            shape('rectangle', [10, 10, 30, 30], { frame: 2, outside: true })] }] });
    assert.equal(collection.search(2, 0, { allowDeletedFrames: false, annotationsFilters: [] }), 1);
});

test('reverse interval properties preserve higher frames and permit reappearance across deleted frames', async () => {
    const { collection, history, ObjectState, label } = editor([50, 51, 53, 55, 57, 60, 63], { deleted: [55] });
    collection.put([new ObjectState({ objectType: 'track', shapeType: 'rectangle', label,
        frame: 60, points: [10, 10, 30, 30], attributes: { 1: 'far' } })], true);
    const at = (frame) => collection.get(frame, true, [])[0];
    const original = collection.export();
    const changed = at(53);
    changed.occluded = true;
    changed.attributes = { 1: 'near' };
    collection.bulkSave([changed], true);
    for (const frame of [50, 51, 53]) {
        assert.equal(at(frame).occluded, true);
        assert.equal(at(frame).attributes[1], 'near');
    }
    for (const frame of [57, 60]) {
        assert.equal(at(frame).occluded, false);
        assert.equal(at(frame).attributes[1], 'far');
    }
    await history.undo(1);
    assert.deepEqual(collection.export(), original);
    const finished = at(53);
    finished.outside = true;
    collection.bulkSave([finished], true);
    assert.equal(at(50).outside, true);
    assert.equal(at(57).outside, false);
    const reappeared = at(51);
    reappeared.outside = false;
    reappeared.points = [15, 15, 25, 25];
    collection.bulkSave([reappeared], true);
    assert.equal(at(50).outside, false);
    assert.deepEqual(at(50).points, [15, 15, 25, 25]);
    assert.equal(at(53).outside, true);
    assert.equal(at(57).outside, false);
    const edited = collection.export();
    collection.bulkSave([at(51)], true);
    assert.deepEqual(collection.export(), edited, 'no-op reverse saves do not add boundaries');
});

test('editing an existing track in reverse preserves earlier authored geometry and extends an earliest seed', () => {
    const { collection, shape } = editor([50, 53, 57, 60, 63]);
    collection.import({ tracks: [{ frame: 53, label_id: 1, group: 0, source: 'manual', attributes: [],
        shapes: [shape('rectangle', [10, 10, 30, 30], { frame: 53 }),
            shape('rectangle', [20, 20, 40, 40], { frame: 60 })] }] });
    const [state] = collection.get(57, false, []);
    state.points = [17, 17, 37, 37];
    collection.bulkSave([state], true);
    assert.deepEqual(collection.get(53, false, [])[0].points, [10, 10, 30, 30]);
    assert.deepEqual(collection.get(60, false, [])[0].points, [20, 20, 40, 40]);
    const [seed] = collection.get(53, false, []);
    seed.points = [12, 12, 32, 32];
    collection.bulkSave([seed], true);
    assert.deepEqual(collection.get(50, false, [])[0].points, [12, 12, 32, 32]);
});

test('reverse skeleton joints preserve attributes, visibility, geometry, and grouped undo', async () => {
    const { collection, history, ObjectState, skeleton } = editor([50, 53, 57, 60, 63]);
    collection.put([new ObjectState({ objectType: 'track', shapeType: 'skeleton', label: skeleton,
        frame: 60, points: [], elements: [{ objectType: 'track', shapeType: 'points',
            frame: 60, label: skeleton.structure.sublabels[0], points: [30, 40],
            attributes: { 20: 'joint', 21: 'old' } }] })], true);
    const at = (frame) => collection.get(frame, true, [])[0];
    const before = collection.export();
    const changed = at(57);
    changed.elements[0].points = [15, 20];
    changed.elements[0].attributes = { 20: 'joint', 21: 'new' };
    collection.bulkSave([changed], true);
    assert.deepEqual(at(50).elements[0].points, [15, 20]);
    assert.equal(at(50).elements[0].attributes[21], 'new');
    assert.deepEqual(at(60).elements[0].points, [30, 40]);
    assert.equal(at(60).elements[0].attributes[21], 'old');
    assert.equal(at(63).outside, true);
    await history.undo(1);
    assert.deepEqual(collection.export(), before);
    const finished = at(53);
    finished.outside = true;
    collection.bulkSave([finished], true);
    assert.equal(at(50).outside, true);
    assert.equal(at(57).outside, false);
});

test('reverse 3D cuboid tracks extend to lower frames without changing higher poses', () => {
    const { collection, ObjectState, label } = editor([50, 53, 57, 60, 63], { dimension: '3d' });
    const points = [1, 2, 3, 0, 0, 0, 4, 5, 6, 0, 0, 0, 0, 0, 0, 0];
    collection.put([new ObjectState({ objectType: 'track', shapeType: 'cuboid', label,
        frame: 60, points })], true);
    const [changed] = collection.get(57, false, []);
    changed.points = [2, ...points.slice(1)];
    collection.bulkSave([changed], true);
    assert.deepEqual(collection.get(50, false, [])[0].points, [2, ...points.slice(1)]);
    assert.deepEqual(collection.get(60, false, [])[0].points, points);
    assert.equal(collection.get(63, true, [])[0].outside, true);
});

test('backward edit propagation changes only the lower side and is undoable', async () => {
    const { collection, shape, history } = editor();
    collection.import({ tracks: [{ frame: 0, label_id: 1, group: 0, source: 'manual', attributes: [],
        shapes: [0, 1, 2].map((frame) => shape('rectangle', [10, 10, 30, 30], { frame })) }] });
    const [state] = collection.get(1, false, []);
    collection.transformRectangleTrack(state, { kind: 'canvas-edit', frame: 1,
        before: [10, 10, 30, 30], after: [14, 10, 34, 30],
        propagation: { direction: 'backward', radius: 1, exponent: 1, createKeyframes: false } });
    assert.deepEqual(collection.get(0, false, [])[0].points, [12, 10, 32, 30]);
    assert.deepEqual(collection.get(1, false, [])[0].points, [14, 10, 34, 30]);
    assert.deepEqual(collection.get(2, false, [])[0].points, [10, 10, 30, 30]);
    await history.undo(1);
    assert.deepEqual(collection.get(0, false, [])[0].points, [10, 10, 30, 30]);
});

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
