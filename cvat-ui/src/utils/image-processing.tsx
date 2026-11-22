// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { ImageProcessing } from 'cvat-core-wrapper';

export enum ImageFilterAlias {
    HISTOGRAM_EQUALIZATION = 'opencv.histogramEqualization',
    GAMMA_CORRECTION = 'fabric.gammaCorrection',
}

export interface ImageFilter {
    modifier: ImageProcessing,
    alias: ImageFilterAlias
}

// Apply display-only color adjustments in the same order as the CSS filter chain.
// Keeping levels in image data avoids browser-specific SVG canvas filtering.
export function applyColorLevels(
    image: ImageData, blackPoint: number, whitePoint: number,
    brightness: number, contrast: number, saturation: number,
): void {
    const clampChannel = (value: number): number => Math.max(0, Math.min(255, value));
    const colors = new Float64Array(256);
    for (let value = 0; value < 256; value++) {
        colors[value] = clampChannel((clampChannel(value * brightness) - 127.5) * contrast + 127.5);
    }

    const scale = 255 / (whitePoint - blackPoint);
    const { data } = image;
    for (let i = 0; i < data.length; i += 4) {
        const red = colors[data[i]];
        const green = colors[data[i + 1]];
        const blue = colors[data[i + 2]];
        const gray = 0.213 * red + 0.715 * green + 0.072 * blue;
        data[i] = (clampChannel(gray + saturation * (red - gray)) - blackPoint) * scale;
        data[i + 1] = (clampChannel(gray + saturation * (green - gray)) - blackPoint) * scale;
        data[i + 2] = (clampChannel(gray + saturation * (blue - gray)) - blackPoint) * scale;
    }
}

export function hasFilter(filters: ImageFilter[], alias: ImageFilterAlias): ImageFilter | null {
    const index = filters.findIndex((imageFilter) => imageFilter.alias === alias);
    if (index !== -1) {
        return filters[index];
    }
    return null;
}
