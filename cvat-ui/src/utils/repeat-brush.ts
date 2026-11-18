// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import type ObjectState from 'cvat-core/src/object-state';
import { ShapeType } from 'cvat-core/src/enums';
import Issue from 'cvat-core/src/issue';

// Canvas path stroking with round joins is the circular dilation of a shape's boundary.
// Together with its fill this tests the actual brush footprint, not its bounding box.
export default function repeatBrushHits(
    context: CanvasRenderingContext2D, state: ObjectState, pointerX: number, pointerY: number, radius: number,
): boolean {
    const path = new Path2D();
    let x = pointerX;
    let y = pointerY;
    let { points } = state;
    let closed = true;
    if ([ShapeType.RECTANGLE, ShapeType.ELLIPSE].includes(state.shapeType)) {
        const [a, b, c, d] = points;
        const cx = state.shapeType === ShapeType.RECTANGLE ? (a + c) / 2 : a;
        const cy = state.shapeType === ShapeType.RECTANGLE ? (b + d) / 2 : b;
        const angle = (-state.rotation * Math.PI) / 180;
        const dx = x - cx;
        const dy = y - cy;
        x = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
        y = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
        if (state.shapeType === ShapeType.RECTANGLE) path.rect(a, b, c - a, d - b);
        else path.ellipse(a, b, Math.abs(c - a), Math.abs(b - d), 0, 0, Math.PI * 2);
    } else if (state.shapeType === ShapeType.MASK) {
        const [left, top, right] = points.slice(-4);
        const width = right - left + 1;
        let offset = 0;
        // Expand only foreground runs, preserving holes and avoiding full-mask decoding.
        points.slice(0, -4).forEach((count, index) => {
            const end = offset + count;
            if (index % 2) {
                while (offset < end) {
                    const column = offset % width;
                    const length = Math.min(end - offset, width - column);
                    path.rect(left + column, top + Math.floor(offset / width), length, 1);
                    offset += length;
                }
            }
            offset = end;
        });
    } else if ([ShapeType.POINTS, ShapeType.SKELETON].includes(state.shapeType)) {
        if (state.shapeType === ShapeType.SKELETON) {
            points = state.elements.filter((element) => !element.hidden && !element.outside)
                .flatMap((element) => element.points);
        }
        for (let i = 0; i < points.length; i += 2) {
            if (Math.hypot(points[i] - x, points[i + 1] - y) <= radius) return true;
        }
        return false;
    } else {
        if (state.shapeType === ShapeType.CUBOID) points = Issue.hull(points);
        closed = state.shapeType !== ShapeType.POLYLINE;
        path.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) path.lineTo(points[i], points[i + 1]);
        if (closed) path.closePath();
    }
    context.lineWidth = radius * 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    return (closed && context.isPointInPath(path, x, y)) || context.isPointInStroke(path, x, y);
}
