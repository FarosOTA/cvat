// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import JSZip from 'jszip';

// Keep compressed bytes in the worker. Only requested images are decoded;
// transferring a bitmap does not leave a second decoded copy in this cache.
const chunks = new Map<number, Promise<JSZip>>();

onmessage = async ({ data: message }) => {
    const { action, chunk, id } = message;
    try {
        if (action === 'delete') {
            chunks.delete(chunk);
            return;
        }
        if (action === 'store') {
            const zip = JSZip.loadAsync(message.block);
            chunks.set(chunk, zip);
            await zip;
            postMessage({ id });
            return;
        }

        const zip = await chunks.get(chunk);
        if (!zip) throw new Error('Image chunk was released before decoding');
        const files = Object.values(zip.files).filter((file) => !file.dir);
        const file = files[message.offset];
        if (!file) throw new Error('Image frame is missing from its chunk');
        const blob = await file.async('blob');
        const bitmap = await createImageBitmap(blob);
        postMessage({ id, bitmap }, { transfer: [bitmap] });
    } catch (error) {
        if (action === 'store') chunks.delete(chunk);
        postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};
