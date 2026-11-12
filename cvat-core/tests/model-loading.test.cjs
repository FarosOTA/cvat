// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { createRequire } = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { transformSync } = require('@babel/core');
const axios = require('axios');

// Exercise the production model manager and HTTP proxy against a local API.
function modelClient(backendAPI) {
    const modules = new Map();
    const client = axios.create();
    client.HttpStatusCode = axios.HttpStatusCode;
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
        const execute = vm.runInNewContext(`(function(require, module, exports, __filename) { ${source}\n})`, {
            URL, setTimeout, clearTimeout, AbortController,
            // Chunk-download workers are unrelated to model discovery.
            Worker: class {},
        }, { filename });
        execute((name) => {
            if (name === 'axios') return Object.assign(client, { AxiosError: axios.AxiosError });
            if (name === 'cvat-data') return { ChunkQuality: { COMPRESSED: 'compressed', ORIGINAL: 'original' } };
            if (name.startsWith('.')) {
                const target = path.resolve(path.dirname(filename), name);
                const resolved = [target, `${target}.ts`, `${target}.js`]
                    .find((candidate) => existsSync(candidate) && path.extname(candidate));
                return load(resolved);
            }
            return localRequire(name);
        }, module, module.exports, filename);
        return module.exports;
    }
    const core = (name) => load(path.resolve(__dirname, `../src/${name}.ts`));
    core('config').default.backendAPI = backendAPI;
    return core('lambda-manager').default;
}

async function api(t, status, body) {
    const server = createServer((request, response) => {
        if (request.method === 'HEAD') {
            response.writeHead(403).end();
            return;
        }
        assert.equal(request.method, 'GET');
        assert.equal(new URL(request.url, 'http://localhost').pathname, '/api/lambda/functions');
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
    }));
    return modelClient(`http://127.0.0.1:${server.address().port}/api`);
}

test('model discovery loads a segmentation interactor when the proxy rejects HEAD', async (t) => {
    const client = await api(t, 200, [{
        id: 'sam', name: 'Segment Anything', kind: 'interactor', version: 2,
        labels_v2: [{ name: 'object', type: 'mask', attributes: [] }],
    }]);
    const { models, count } = await client.list();
    assert.equal(count, 1);
    assert.equal(models[0].id, 'sam');
    assert.equal(models[0].name, 'Segment Anything');
    assert.equal(models[0].kind, 'interactor');
    assert.equal(models[0].version, 2);
    assert.equal(models[0].returnType, 'mask');
});

test('absent or unavailable serverless backends still produce an empty model catalog', async (t) => {
    for (const status of [404, 503]) {
        const client = await api(t, status, { detail: 'Serverless unavailable' });
        const { models, count } = await client.list();
        assert.equal(count, 0);
        assert.equal(models.length, 0);
    }
});

test('model discovery preserves authorization and server errors instead of hiding them', async (t) => {
    for (const status of [401, 403, 500]) {
        const client = await api(t, status, { detail: `Model catalog rejected: ${status}` });
        await assert.rejects(client.list(), (error) => {
            assert.equal(error.code, status);
            assert.equal(error.message, `Model catalog rejected: ${status}`);
            return true;
        });
    }
});
