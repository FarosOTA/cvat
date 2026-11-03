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

// Run the production frame/cache code with deterministic worker messages and a
// local metadata endpoint. No browser, server, or real task data is required.
function createSession({
    chunkSize = 1, size = 12, getChunk = async () => new ArrayBuffer(0),
    getPreviewChunk = async () => new ArrayBuffer(1), mode = 'annotation',
    getImageFrame = async (number) => ({ number }),
    width = 32, height = 24,
    frameBufferMultiplier = 10,
} = {}) {
    class Bitmap {
        closed = false;
        width = width;
        height = height;
        close() { this.closed = true; }
    }
    class Worker {
        chunks = new Map();
        postMessage({ start, end, block, action, chunk, id, offset }) {
            queueMicrotask(() => {
                if (action) {
                    if (action === 'delete') { this.chunks.delete(chunk); return; }
                    if (action === 'store') {
                        this.chunks.set(chunk, block.byteLength);
                        this.onmessage({ data: { id } });
                    } else {
                        const bitmap = Object.assign(new Bitmap(), {
                            number: chunk * chunkSize + offset,
                            preview: !!this.chunks.get(chunk),
                        });
                        this.onmessage({ data: { id, bitmap } });
                    }
                    return;
                }
                for (let index = start; index <= end; index++) {
                    const bitmap = new Bitmap();
                    bitmap.preview = !!block.byteLength;
                    this.onmessage({ data: { index, data: bitmap } });
                }
            });
        }
        terminate() {}
    }
    const modules = new Map();
    const proxy = { frames: { getData: (_, index) => getPreviewChunk(index),
        getFrame: (_, number, signal) => getImageFrame(number, signal), getMeta: async () => ({
        chunk_size: chunkSize,
        deleted_frames: [],
        frames: [{ width, height, name: 'frame.png', related_files: 0 }],
        size,
        start_frame: 0,
        stop_frame: size - 1,
        frame_filter: '',
        chunks_updated_date: '2026-01-01T00:00:00Z',
    }) } };
    function load(filename) {
        if (modules.has(filename)) return modules.get(filename).exports;
        const module = { exports: {} };
        modules.set(filename, module);
        const localRequire = createRequire(filename);
        const source = transformSync(readFileSync(filename, 'utf8'), {
            filename,
            configFile: path.resolve(__dirname, '../babel.config.json'),
            babelrc: false,
        }).code;
        const execute = vm.runInNewContext(`(function(require, module, exports) { ${source}\n})`, {
            ImageBitmap: Bitmap, Worker, Promise, AbortController, DOMException, RangeError, setTimeout, clearTimeout,
            URL, window: { addEventListener() {} },
            createImageBitmap: async ({ number }) => Object.assign(new Bitmap(), { number, preview: false }),
            __filename: filename,
        }, { filename });
        execute((name) => {
            if (name === './server-proxy') return { __esModule: true, default: proxy };
            if (name === 'cvat-data') return load(path.resolve(__dirname, '../../cvat-data/src/ts/cvat-data.ts'));
            if (name.startsWith('.') && !path.extname(name)) {
                const target = path.resolve(path.dirname(filename), name);
                return load(existsSync(`${target}.ts`) ? `${target}.ts` : `${target}.js`);
            }
            return localRequire(name);
        }, module, module.exports);
        return module.exports;
    }
    load(path.resolve(__dirname, '../src/config.ts')).default.frameBufferMultiplier = frameBufferMultiplier;
    const frames = load(path.resolve(__dirname, '../src/frames.ts'));
    const data = load(path.resolve(__dirname, '../../cvat-data/src/ts/cvat-data.ts'));
    return {
        ...frames,
        ...data,
        canvas: load(path.resolve(__dirname, '../../cvat-canvas/src/typescript/canvasModel.ts')),
        read: async (number, playing = true, step = 1, onServerRequest, usePreview = false) => {
            const frame = await frames.getFrame(
                1, chunkSize, 'imageset', mode, number, 0, playing, step,
                data.DimensionType.DIMENSION_2D, getChunk,
            );
            return frame.data(onServerRequest, usePreview);
        },
    };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('lookaround retains compressed chunks on both sides and reuses a backward boundary', async () => {
    const requested = [];
    const session = createSession({ chunkSize: 8, size: 400, frameBufferMultiplier: 1,
        getChunk: async (index) => {
            requested.push(index);
            return new ArrayBuffer(4 * 1024 * 1024);
        } });
    try {
        await session.read(47);
        await settle();
        const chunks = Array.from(session.getCachedChunks(1));
        assert.equal(chunks.length, 4, '16 MiB holds four compressed chunks, not ten decoded chunks');
        assert.ok(chunks.includes(4) && chunks.includes(5) && chunks.includes(6));
        await session.read(48);
        await session.read(47);
        await settle();
        assert.equal(requested.filter((index) => index === 5).length, 1,
            '47 → 48 → 47 must not redownload the previous chunk');
        assert.ok(session.getCachedChunks(1).length <= 4);
    } finally { session.clear(1); }
});

test('the small decoded window preserves the selected image and closes evicted bitmaps', async () => {
    const session = createSession({ width: 3864, height: 2192, size: 1000 });
    try {
        const first = (await session.read(0)).imageData;
        await settle();
        assert.equal(first.closed, false, 'prefetch must not evict the displayed image');
        for (let number = 1; number <= 12; number++) await session.read(number);
        assert.equal(first.closed, true, 'old decoded images must be released within the separate 128 MiB budget');
        const images = await Promise.all([session.read(12), session.read(12)]);
        assert.equal(images[0].imageData, images[1].imageData);
        assert.equal(images[0].imageData.closed, false);
    } finally { session.clear(1); }
});

test('one decoded neighbor is warmed without exceeding the selected-image budget', async () => {
    for (const width of [3864, 9000]) {
        const session = createSession({ width, height: width === 3864 ? 2192 : 9000 });
        const buffer = new session.ImageFrameBuffer({
            frames: Array.from({ length: 20 }, (_, i) => i), chunkSize: 8,
            chunkLimit: 10, encodedBytes: 16 * 1024 * 1024, decodedBytes: 128 * 1024 * 1024,
            getChunk: async () => new ArrayBuffer(100),
        });
        try {
            const current = await buffer.frame(0);
            await settle();
            assert.equal(current.closed, false);
            assert.equal(!!buffer.cachedFrame(1), width === 3864,
                'warm one neighbor only when two images fit; retain an oversized selected image alone');
            assert.equal(buffer.cachedFrame(2), null, 'never decode the entire compressed lookaround');
        } finally { buffer.close(); }
    }
});

test('concurrent reads of the same cold image share a live decoded bitmap', async () => {
    let finish;
    const session = createSession({ getChunk: () => new Promise((resolve) => { finish = resolve; }) });
    try {
        const reads = Promise.all([session.read(0), session.read(0)]);
        await settle();
        finish(new ArrayBuffer(0));
        const images = await reads;
        assert.equal(images[0].imageData, images[1].imageData);
        assert.equal(images[0].imageData.closed, false);
    } finally { session.clear(1); }
});

test('an oversized chunk falls back to one task-quality image without repeated chunk downloads', async () => {
    let chunks = 0;
    const session = createSession({ getChunk: async () => {
        chunks++;
        throw Object.assign(new Error('Too large for this client budget'), { code: 413 });
    } });
    try {
        for (const number of [5, 5]) {
            const image = await session.read(number);
            assert.equal(image.imageData.number, number);
            assert.equal(image.imageData.preview, false);
        }
        assert.equal(chunks, 1);
        assert.equal(session.getCachedChunks(1).length, 0);
    } finally { session.clear(1); }
});

test('seeking cancels obsolete network speculation and immediately downloads the selected chunk', async () => {
    let aborted = false;
    const session = createSession({ size: 300,
        getChunk: async (index, quality, { signal } = {}) => {
            if (index === 1) return new Promise((resolve, reject) => {
                signal.addEventListener('abort', () => {
                    aborted = true;
                    reject(new DOMException('Cancelled', 'AbortError'));
                });
            });
            return new ArrayBuffer(0);
        } });
    try {
        await session.read(0);
        await settle();
        assert.equal((await session.read(200)).imageData.number, 200);
        assert.equal(aborted, true);
        await settle();
        assert.ok(session.getCachedChunks(1).includes(199));
    } finally { session.clear(1); }
});

test('image playback displays a ready frame without waiting for speculative chunks', async () => {
    let finishDownload;
    const session = createSession({ mode: 'interpolation', chunkSize: 3, getChunk: async (chunk) => (
        chunk === 1 ? new Promise((resolve) => { finishDownload = resolve; }) : new ArrayBuffer(0)
    ) });
    try {
        await session.read(0, false);
        let displayed = false;
        const playing = session.read(1).then(() => { displayed = true; });
        await settle();
        assert.equal(displayed, true, 'a ready image must not wait for an unrelated speculative download');
        finishDownload(new ArrayBuffer(0));
        await playing;
        assert.equal(displayed, true);
        await settle();
        assert.ok(session.getCachedChunks(1).includes(1));
    } finally {
        session.clear(1);
    }
});

test('compressed playback does not block a ready image behind a pending chunk', async () => {
    let finishNext;
    let finishLater;
    const session = createSession({ chunkSize: 3, size: 9, getPreviewChunk: async (chunk) => {
        if (chunk === 1) return new Promise((resolve) => { finishNext = resolve; });
        if (chunk === 2) return new Promise((resolve) => { finishLater = resolve; });
        return new ArrayBuffer(1);
    } });
    try {
        await session.read(0, false, 1, undefined, true);
        let displayed = false;
        const playing = session.read(1, true, 1, undefined, true).then(() => { displayed = true; });
        await settle();
        assert.equal(displayed, true, 'speculative downloads do not block the selected cached chunk');
        finishNext(new ArrayBuffer(1));
        await playing;
        assert.equal(displayed, true, 'a further pending chunk must not hold the ready image');
    } finally {
        session.clear(1);
        finishNext?.(new ArrayBuffer(1));
        finishLater?.(new ArrayBuffer(1));
    }
});

test('a slow lookaround transfer does not hold the other prefetch slot idle', async () => {
    for (const direction of [1, -1]) {
        const session = createSession();
        let release;
        let active = 0;
        let peak = 0;
        const buffer = new session.ImageFrameBuffer({
            frames: Array.from({ length: 160 }, (_, i) => i), chunkSize: 8,
            chunkLimit: 7, encodedBytes: 700, decodedBytes: 128 * 1024 * 1024,
            getChunk: async (index, signal) => {
                active++;
                peak = Math.max(peak, active);
                try {
                    if (index === 10 - direction) {
                        await new Promise((resolve, reject) => {
                            release = resolve;
                            signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
                        });
                    }
                    return new ArrayBuffer(100);
                } finally { active--; }
            },
        });
        try {
            await buffer.frame(81);
            if (direction === -1) await buffer.frame(80);
            await settle();
            assert.ok(buffer.cachedChunks().includes(10 + direction));
            assert.ok(buffer.cachedChunks().includes(10 + 2 * direction),
                'continue filling beyond the completed neighbor while the opposite transfer is pending');
            assert.ok(peak <= 2, 'rolling prefetch must still limit concurrent transfers to two');
            release();
            await settle();
            assert.deepEqual(Array.from(buffer.cachedChunks()), [7, 8, 9, 10, 11, 12, 13]);
        } finally {
            buffer.close();
            release?.();
            session.clear(1);
        }
    }
});

test('playback prefetches after a cold load, including one-frame chunks', async () => {
    const session = createSession({ size: 120 });
    try {
        await session.read(0);
        await settle();
        assert.deepEqual(Array.from(session.getCachedChunks(1)), Array.from({ length: 100 }, (_, i) => i));
        await session.read(0, false);
        let misses = 0;
        await session.read(1, true, 1, () => { misses++; });
        assert.equal(misses, 0, 'the next frame must already be buffered');
        await settle();
        assert.deepEqual(Array.from(session.getCachedChunks(1)), Array.from({ length: 100 }, (_, i) => i),
            'retain images behind playback within the lookaround window');
        await session.read(2, true, 1, () => { misses++; });
        assert.equal(misses, 0, 'do not download the prefetched next frame a second time');
    } finally {
        session.clear(1);
    }
});

test('paused look-ahead fills ahead and respects chunk boundaries, reverse steps, and job end', async () => {
    const session = createSession({ chunkSize: 3, size: 8 });
    try {
        await session.read(0, false);
        await settle();
        assert.deepEqual(Array.from(session.getCachedChunks(1)), [0, 1, 2], 'pause fills available look-ahead');
        await session.read(7);
        await settle();
        assert.deepEqual(Array.from(session.getCachedChunks(1)), [0, 1, 2], 'no chunk beyond the last frame');
        await session.read(7, true, -1);
        await settle();
        assert.deepEqual(Array.from(session.getCachedChunks(1)), [0, 1, 2]);
        assert.ok((await session.read(4)).imageData);
    } finally {
        session.clear(1);
    }
});

test('a failed speculative download does not interrupt playback and can be retried', async () => {
    let fail = true;
    const session = createSession({ getChunk: async (chunk) => {
        if (chunk === 1 && fail) throw new Error('temporary network failure');
        return new ArrayBuffer(0);
    } });
    try {
        assert.ok((await session.read(0)).imageData);
        await settle();
        assert.ok(session.getCachedChunks(1).includes(0), 'keep the selected chunk after speculative failure');
        assert.ok(!session.getCachedChunks(1).includes(1), 'never mark the failed transfer as cached');
        fail = false;
        await session.read(0);
        await settle();
        assert.deepEqual(Array.from(session.getCachedChunks(1)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    } finally {
        session.clear(1);
    }
});

test('a speculative download completing after job close does not affect a reopened job', async () => {
    let finishDownload;
    let delay = true;
    const session = createSession({ getChunk: async (chunk) => {
        if (chunk === 1 && delay) {
            return new Promise((resolve) => { finishDownload = resolve; });
        }
        return new ArrayBuffer(0);
    } });
    try {
        await session.read(0);
        session.clear(1);
        delay = false;
        await session.read(5, false);
        finishDownload(new ArrayBuffer(0));
        await settle();
        assert.deepEqual(Array.from(session.getCachedChunks(1)), Array.from({ length: 12 }, (_, i) => i));
        assert.ok((await session.read(5, false)).imageData);
    } finally {
        session.clear(1);
    }
});

test('full-quality startup displays one image, then buffers compressed 4K chunks without decoding them all', async () => {
    let finishCurrent;
    const requested = [];
    const session = createSession({
        width: 3840, height: 2160, chunkSize: 32, size: 768,
        getChunk: async (index) => {
            requested.push(index);
            return index === 0 ? new Promise((resolve) => { finishCurrent = resolve; }) : new ArrayBuffer(0);
        },
    });
    try {
        const first = await session.read(0, false, 1, undefined, 'buffered');
        assert.equal(first.imageData.preview, false);
        assert.equal(first.renderWidth, 3840);
        assert.equal(first.renderHeight, 2160);
        await settle();
        assert.deepEqual(requested, [0], 'the first image does not wait for the whole chunk');
        finishCurrent(new ArrayBuffer(0));
        await settle();
        const buffered = Array.from({ length: 24 }, (_, i) => i);
        assert.deepEqual(Array.from(session.getCachedChunks(1)), buffered, 'buffer ahead while paused');
        assert.deepEqual(requested, buffered, 'compressed chunks no longer cost a whole chunk of RGBA memory');
        let misses = 0;
        const next = await session.read(32, true, 1, () => { misses++; });
        assert.equal(misses, 0);
        assert.equal(next.imageData.preview, false);
        await settle();
        assert.deepEqual(Array.from(session.getCachedChunks(1)), buffered);
        assert.equal(next.imageData.closed, false, 'keep the displayed chunk alive');
    } finally {
        session.clear(1);
        finishCurrent?.(new ArrayBuffer(0));
    }
});

test('client buffer multiplier scales compressed chunk capacity independently of decoded image dimensions', async () => {
    for (const multiplier of [1, 3, 10]) {
        for (const largeImages of [false, true]) {
            const session = createSession({
                frameBufferMultiplier: multiplier,
                size: 4000,
                chunkSize: largeImages ? 32 : 1,
                width: largeImages ? 3840 : 32,
                height: largeImages ? 2160 : 24,
            });
            try {
                await session.read(0, false);
                await settle();
                const expected = 10 * multiplier;
                assert.deepEqual(Array.from(session.getCachedChunks(1)),
                    Array.from({ length: expected }, (_, i) => i));
                const next = await session.read(largeImages ? 32 : 1);
                assert.equal(next.imageData.preview, false, 'buffer size never changes task quality');
            } finally {
                session.clear(1);
            }
        }
    }
});

test('pause during an in-flight look-ahead continues filling, and a seek redirects the chain', async () => {
    let finishNext;
    const requested = [];
    const session = createSession({ size: 300, getChunk: async (index) => {
        requested.push(index);
        return index === 1 ? new Promise((resolve) => { finishNext = resolve; }) : new ArrayBuffer(0);
    } });
    try {
        await session.read(0);
        await session.read(0, false);
        finishNext(new ArrayBuffer(0));
        await settle();
        assert.deepEqual(Array.from(session.getCachedChunks(1)), Array.from({ length: 100 }, (_, i) => i));
        await session.read(200, false);
        await settle();
        assert.deepEqual(Array.from(session.getCachedChunks(1)), Array.from({ length: 100 }, (_, i) => i + 151));
        assert.ok(!requested.includes(100), 'do not continue filling from the old position');
    } finally {
        session.clear(1);
        finishNext?.(new ArrayBuffer(0));
    }
});

test('decoding ahead evicts the least recently used chunk, not the current frame', async () => {
    const { FrameDecoder, BlockType, DimensionType } = createSession();
    const decoder = new FrameDecoder(BlockType.ARCHIVE, 2, (frame) => frame, DimensionType.DIMENSION_2D);
    const decode = (chunk) => new Promise((resolve, reject) => {
        decoder.requestDecodeBlock(new ArrayBuffer(0), chunk, [chunk], () => {}, resolve, reject);
    });
    try {
        await decode(0);
        await decode(1);
        const current = decoder.frame(0);
        await decode(2);
        assert.equal(current.closed, false, 'prefetch must not close the image being displayed');
        assert.equal(decoder.frame(0), current);
        assert.deepEqual(Array.from(decoder.cachedChunks()), [0, 2]);
        decoder.cleanup(1, [2]);
        await decode(1);
        assert.deepEqual(Array.from(decoder.cachedChunks()), [1, 2],
            'protect the future frame even when a frame behind playback was accessed more recently');
        assert.equal(current.closed, true, 'release the discarded bitmap');
    } finally {
        decoder.close();
    }
});

test('optional previews preserve logical dimensions and do not replace annotation-quality data', async () => {
    const session = createSession();
    try {
        const preview = await session.read(2, true, 1, undefined, true);
        assert.equal(preview.imageData.preview, true);
        assert.equal(preview.renderWidth, 32);
        assert.equal(preview.renderHeight, 24);
        assert.equal((await session.read(2, false, 1, undefined, true)).imageData.preview, true,
            'paused UI can explicitly request a preview before refinement');
        const full = await session.read(2, false);
        assert.equal(full.imageData.preview, false, 'refinement keeps the existing quality');
        assert.equal((await session.read(3)).imageData.preview, false, 'API consumers default to full quality');
    } finally {
        session.clear(1);
    }
});

test('paused refinement can display one full-quality frame without downloading its whole chunk',
    { timeout: 2000 }, async () => {
        const session = createSession({ chunkSize: 8, getChunk: () => new Promise(() => {}) });
        try {
            const full = await session.read(7, false, 1, undefined, 'frame');
            assert.equal(full.imageData.preview, false);
            assert.equal(full.imageData.number, 7);
            assert.equal(full.renderWidth, 32);
            assert.equal(full.renderHeight, 24);
            assert.equal((await session.read(7, false, 1, undefined, true)).imageData.preview, true);
        } finally {
            session.clear(1);
        }
    });

test('individual-frame refinement falls back to existing chunks when unavailable', async () => {
    const session = createSession({ getImageFrame: async () => {
        throw Object.assign(new Error('Unsupported frame endpoint'), { code: 400 });
    } });
    try {
        const full = await session.read(5, false, 1, undefined, 'frame');
        assert.equal(full.imageData.preview, false);
        assert.equal(full.renderWidth, 32);
        assert.equal(full.renderHeight, 24);
    } finally {
        session.clear(1);
    }
});

test('cancelling optional refinement does not download a chunk and a later pause can refine again',
    { timeout: 2000 }, async () => {
        let finish;
        const session = createSession({ getImageFrame: (_, signal) => new Promise((resolve, reject) => {
            finish = resolve;
            signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
        }) });
        try {
            const frame = await session.getFrame(
                1, 1, 'imageset', 'annotation', 5, 0, false, 1, session.DimensionType.DIMENSION_2D,
                async () => { throw new Error('Cancelled refinement must not download a chunk'); },
            );
            const cancelled = assert.rejects(frame.data(undefined, 'frame'), (error) => error === 5);
            await settle();
            frame.cancelRefinement();
            await cancelled;
            const retried = frame.data(undefined, 'frame');
            await settle();
            finish({ number: 5 });
            assert.equal((await retried).imageData.number, 5);
        } finally {
            session.clear(1);
        }
    });

test('an older server falls back once, then keeps working with existing chunks', async () => {
    let attempts = 0;
    const session = createSession({ getPreviewChunk: async () => {
        attempts++;
        throw Object.assign(new Error('Unsupported data type'), { code: 400 });
    } });
    try {
        assert.equal((await session.read(0, true, 1, undefined, true)).imageData.preview, false);
        assert.equal((await session.read(1, true, 1, undefined, true)).imageData.preview, false);
        assert.equal(attempts, 1);
    } finally {
        session.clear(1);
    }
});

test('canvas readiness waits for the requested image and stale previews cannot replace refinement', async () => {
    const { canvas: { CanvasModelImpl, UpdateReasons } } = createSession();
    const model = new CanvasModelImpl();
    const notifications = [];
    model.subscribe({ notify: (_, reason) => notifications.push(reason) });
    const image = (name) => ({ renderWidth: 32, renderHeight: 24, imageData: { name } });
    const frame = (number, data) => ({ number, width: 32, height: 24, deleted: false, data });
    model.setup(frame(0, async () => image('initial')), []);
    await settle();
    notifications.length = 0;
    let finishPreview;
    const next = frame(1, () => new Promise((resolve) => { finishPreview = resolve; }));
    model.setup(next, []);
    model.setup(next, []);
    model.fitCanvas(1280, 720);
    assert.ok(!notifications.includes(UpdateReasons.OBJECTS_UPDATED),
        'resizing or annotation updates must not mark a frame ready before its image arrives');
    finishPreview(image('preview'));
    await settle();
    assert.equal(model.image.imageData.name, 'preview');
    assert.ok(notifications.includes(UpdateReasons.OBJECTS_UPDATED));

    model.configure({ forceFrameUpdate: true });
    model.setup(frame(1, () => new Promise((resolve) => { finishPreview = resolve; })), []);
    model.setup(frame(1, async () => image('full')), []);
    await settle();
    finishPreview(image('late preview'));
    await settle();
    assert.equal(model.image.imageData.name, 'full', 'a late same-frame preview cannot overwrite full quality');
});
