// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { transformSync } = require('@babel/core');

const filename = path.resolve(__dirname, '../src/download.worker.ts');
const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    configFile: path.resolve(__dirname, '../babel.config.json'),
    babelrc: false,
});

function response(bytes, { status = 200, size = 7, checksum = 'original', headers = {} } = {}) {
    return new Response(Uint8Array.from(bytes), {
        status,
        headers: {
            'x-checksum': checksum,
            'x-updated-date': '2026-01-01T00:00:00Z',
            ...(size === null ? {} : { 'x-chunk-size': `${size}` }),
            ...headers,
        },
    });
}

async function download(fetch, type = 'chunk', config = {}, onStart = () => {}) {
    let finish;
    const result = new Promise((resolve) => { finish = resolve; });
    const worker = {
        onmessage: null,
        URL, Headers, performance, fetch, AbortController, DOMException,
        self: { location: { origin: 'http://localhost' } },
        setTimeout: (callback) => queueMicrotask(callback),
        clearTimeout,
        postMessage: finish,
    };
    vm.runInNewContext(code, worker, { filename });
    worker.onmessage({ data: { id: 42, url: '/api/jobs/1/data', config: { params: { type }, ...config } } });
    onStart(worker);
    return result;
}

const bytes = [9, 2, 7, 4, 1, 8, 3];

test('aborting a foreground download cancels fetch without retrying', async () => {
    let attempts = 0;
    const result = await download(async (_, { signal }) => {
        attempts++;
        return new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
        });
    }, 'playback_chunk', {}, (worker) => worker.onmessage({ data: { action: 'abort', id: 42 } }));
    assert.equal(attempts, 1);
    assert.equal(result.isSuccess, false);
    assert.match(result.message, /cancelled/i);
});

test('oversize chunks are rejected before retaining their body, including missing size headers', async () => {
    for (const size of [bytes.length, null]) {
        const result = await download(async () => response(bytes, { size }), 'playback_chunk', { maxContentLength: 4 });
        assert.equal(result.isSuccess, false);
        assert.equal(result.code, 413);
    }
});

test('initial full responses work with and without decoded-size metadata', async () => {
    for (const size of [bytes.length, null]) {
        const result = await download(async (_, { headers }) => {
            assert.equal(headers.has('Range'), false);
            return response(bytes, { size });
        });
        assert.equal(result.isSuccess, true);
        assert.equal(result.id, 42);
        assert.deepEqual([...new Uint8Array(result.responseData)], bytes);
    }
});

test('normal and preview chunks resume from decoded bytes, not encoded Content-Length', async () => {
    for (const type of ['chunk', 'preview_chunk']) {
        const result = await download(async (url, { headers }) => {
            assert.equal(new URL(url).searchParams.get('type'), type);
            if (!headers.has('Range')) {
                return response(bytes.slice(0, 3), { headers: { 'content-length': '2' } });
            }
            assert.equal(headers.get('Range'), 'bytes=3-');
            return response(bytes.slice(3), { status: 206, headers: { 'content-range': 'bytes 3-6/7' } });
        }, type);
        assert.equal(result.isSuccess, true);
        assert.deepEqual([...new Uint8Array(result.responseData)], bytes);
        assert.equal(result.headers['content-length'], '7');
    }
});

test('a full response to a resumed request replaces partial bytes instead of appending', async () => {
    const result = await download(async (_, { headers }) => (
        headers.has('Range') ? response(bytes) : response(bytes.slice(0, 2))
    ));
    assert.equal(result.isSuccess, true);
    assert.deepEqual([...new Uint8Array(result.responseData)], bytes);
});

test('changed chunk identity restarts rather than mixing generations', async () => {
    const replacement = [6, 5, 4, 3, 2, 1, 0];
    let changed = false;
    const result = await download(async (_, { headers }) => {
        if (headers.has('Range')) {
            changed = true;
            return response(replacement.slice(2), {
                status: 206, checksum: 'replacement', headers: { 'content-range': 'bytes 2-6/7' },
            });
        }
        return changed ? response(replacement, { checksum: 'replacement' }) : response(bytes.slice(0, 2));
    });
    assert.equal(result.isSuccess, true);
    assert.deepEqual([...new Uint8Array(result.responseData)], replacement);
});

test('invalid size, oversized data, and incorrect resume offsets fail instead of exposing corrupt chunks', async () => {
    for (const fetch of [
        async () => response(bytes, { size: 'invalid' }),
        async () => response(bytes, { size: 6 }),
        async (_, { headers }) => (headers.has('Range') ?
            response(bytes.slice(2), { status: 206, headers: { 'content-range': 'bytes 1-5/7' } }) :
            response(bytes.slice(0, 2))),
    ]) {
        const result = await download(fetch);
        assert.equal(result.isSuccess, false);
        assert.equal(result.responseData, undefined);
    }
});
