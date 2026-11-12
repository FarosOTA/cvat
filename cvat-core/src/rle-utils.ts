// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/**
 * Encodes a flattened binary mask into CVAT RLE.
 * The encoded sequence always starts with the length of the initial zero run.
 * Examples:
 * [0, 0, 0, 1] -> [3, 1]
 * [1, 1, 0, 0] -> [0, 2, 2]
 */
export function mask2Rle(mask: ArrayLike<number>): number[] {
    const { length } = mask;
    const acc: number[] = [0];
    if (length === 0) {
        return acc;
    }

    // idx = 0
    const first = mask[0];
    if (first > 0) {
        acc.push(1);
    } else {
        acc[0] = 1;
    }

    // idx > 0
    for (let idx = 1; idx < length; idx++) {
        const val = mask[idx];
        if (mask[idx - 1] === val) {
            acc[acc.length - 1] += 1;
        } else {
            acc.push(1);
        }
    }

    return acc;
}

/**
 * Decodes CVAT RLE back into a flattened binary mask of size width * height.
 * RLE is expected to start with the length of the initial zero run, so:
 * [3, 1] -> [0, 0, 0, 1]
 * [0, 2, 2] -> [1, 1, 0, 0]
 */
export function rle2Mask(rle: ArrayLike<number>, width: number, height: number): number[] {
    const decoded = Array(width * height).fill(0);
    const { length } = rle;
    let decodedIdx = 0;
    let value = 0;
    let i = 0;

    while (i < length) {
        let count = rle[i];
        while (count > 0) {
            decoded[decodedIdx] = value;
            decodedIdx++;
            count--;
        }
        i++;
        value = Math.abs(value - 1);
    }

    return decoded;
}

/** Tight pixel-edge box of a CVAT mask (RLE followed by inclusive left/top/right/bottom). */
export function rle2Box(mask: ArrayLike<number>): number[] | null {
    const end = mask.length - 4;
    const left = mask[end];
    const top = mask[end + 1];
    const width = mask[end + 2] - left + 1;
    let minX = width;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    let offset = 0;
    for (let i = 0; i < end; i++) {
        const count = mask[i];
        if (i % 2 && count > 0) {
            const startY = Math.floor(offset / width);
            const endY = Math.floor((offset + count - 1) / width);
            minY = Math.min(minY, startY);
            maxY = Math.max(maxY, endY);
            minX = Math.min(minX, startY === endY ? offset % width : 0);
            maxX = Math.max(maxX, startY === endY ? (offset + count - 1) % width : width - 1);
        }
        offset += count;
    }
    return maxX < 0 ? null : [left + minX, top + minY, left + maxX + 1, top + maxY + 1];
}
