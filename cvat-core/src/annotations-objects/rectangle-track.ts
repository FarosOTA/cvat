// Copyright (C) 2019-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { HistoryActions, ShapeType, Source } from '../enums';
import { ArgumentError } from '../exceptions';
import ObjectState from '../object-state';
import type { SerializedTrack } from '../server-response-types';
import {
    checkNumberOfPoints, checkShapeArea, findAngleDiff,
} from '../object-utils';
import { Track } from './track';
import type {
    AnnotationInjection,
    InterpolatedPosition,
    RectanglePoints,
    RectangleTrackMetadata,
    RectangleTrackTransformRequest,
    RectangleTrackTransformResult,
    TrackedShape,
} from './types';
import { RectangleShape } from './rectangle-shape';
import { computeNewSource, copyShape } from './utils';

function finiteNumber(value: unknown, name: string): asserts value is number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ArgumentError(`${name} must be a finite number`);
    }
}

function rectangleGeometry(points: RectanglePoints): {
    cx: number;
    cy: number;
    width: number;
    height: number;
} {
    const [xtl, ytl, xbr, ybr] = points;
    return {
        cx: (xtl + xbr) / 2,
        cy: (ytl + ybr) / 2,
        width: xbr - xtl,
        height: ybr - ytl,
    };
}

function rectanglePoints(cx: number, cy: number, width: number, height: number): number[] {
    return [
        cx - width / 2,
        cy - height / 2,
        cx + width / 2,
        cy + height / 2,
    ];
}

function cloneShape(shape: TrackedShape): TrackedShape {
    return {
        ...shape,
        points: shape.points ? [...shape.points] : undefined,
        attributes: new Map(shape.attributes),
    };
}

function samePoints(left: number[], right: number[]): boolean {
    return left.length === right.length && left.every((coordinate, index) => coordinate === right[index]);
}

export class RectangleTrack extends Track {
    constructor(data: SerializedTrack, clientID: number, color: string, injection: AnnotationInjection) {
        super(data, clientID, color, injection);
        this.shapeType = ShapeType.RECTANGLE;
        this.pinned = false;
        for (const shape of Object.values(this.shapes)) {
            checkNumberOfPoints(this.shapeType, shape.points);
        }
    }

    protected interpolatePosition(leftPosition, rightPosition, offset): InterpolatedPosition {
        const positionOffset = leftPosition.points.map((point, index) => rightPosition.points[index] - point);
        return {
            points: leftPosition.points.map((point, index) => point + positionOffset[index] * offset),
            rotation:
                (leftPosition.rotation + findAngleDiff(
                    rightPosition.rotation, leftPosition.rotation,
                ) * offset + 360) % 360,
            occluded: leftPosition.occluded,
            outside: leftPosition.outside,
            zOrder: leftPosition.zOrder,
        };
    }

    private frameNumbers(): number[] {
        return Object.keys(this.framesInfo)
            .map((frame) => +frame)
            .filter((frame) => Number.isInteger(frame))
            .sort((left, right) => left - right);
    }

    private fitRectangle(points: number[], rotation: number, frame: number): number[] {
        const fitted = rotation ? [...points] : points.map((coordinate, index) => {
            const limit = index % 2 ? this.framesInfo[frame].height : this.framesInfo[frame].width;
            return Math.max(0, Math.min(limit, coordinate));
        });

        if (!checkShapeArea(ShapeType.RECTANGLE, fitted)) {
            throw new ArgumentError(`The transformed rectangle on frame ${frame} is smaller than 1 pixel`);
        }

        return fitted;
    }

    private shapeAt(frame: number): TrackedShape {
        if (this.shapes[frame]) {
            return cloneShape(this.shapes[frame]);
        }

        const { prev, next } = this.boundedKeyframes(frame);
        return copyShape(this.getPosition(frame, prev, next));
    }

    private validateRequest(request: RectangleTrackTransformRequest): void {
        if (!request || !['all-keyframes', 'canvas-edit'].includes(request.kind)) {
            throw new ArgumentError('Unknown rectangle track transform kind');
        }

        const frames = this.frameNumbers();
        if (!Number.isInteger(request.frame) || !frames.includes(request.frame)) {
            throw new ArgumentError('The transform frame must belong to the track job');
        }

        if (request.kind === 'all-keyframes') {
            finiteNumber(request.translation.dx, 'Translation dx');
            finiteNumber(request.translation.dy, 'Translation dy');
            finiteNumber(request.resize.width, 'Resize width');
            finiteNumber(request.resize.height, 'Resize height');
            if (!['pixels', 'percent'].includes(request.resize.unit)) {
                throw new ArgumentError('Resize unit must be pixels or percent');
            }
            return;
        }

        if (this.framesInfo.isFrameDeleted(request.frame)) {
            throw new ArgumentError('Canvas edits cannot be propagated from a deleted frame');
        }
        checkNumberOfPoints(ShapeType.RECTANGLE, request.before);
        checkNumberOfPoints(ShapeType.RECTANGLE, request.after);
        request.before.forEach((coordinate) => finiteNumber(coordinate, 'Before coordinate'));
        request.after.forEach((coordinate) => finiteNumber(coordinate, 'After coordinate'));
        if (!['forward', 'backward', 'both'].includes(request.propagation.direction)) {
            throw new ArgumentError('Propagation direction must be forward, backward or both');
        }
        if (!Number.isInteger(request.propagation.radius) || request.propagation.radius < 1) {
            throw new ArgumentError('Propagation radius must be a positive integer');
        }
        finiteNumber(request.propagation.exponent, 'Propagation exponent');
        if (request.propagation.exponent <= 0) {
            throw new ArgumentError('Propagation exponent must be greater than zero');
        }
        if (typeof request.propagation.createKeyframes !== 'boolean') {
            throw new ArgumentError('createKeyframes must be a boolean');
        }
        if (!checkShapeArea(ShapeType.RECTANGLE, request.before) ||
            !checkShapeArea(ShapeType.RECTANGLE, request.after)) {
            throw new ArgumentError('Canvas edit rectangles must be at least 1 pixel wide and high');
        }
    }

    private transformAllKeyframes(request: Extract<RectangleTrackTransformRequest, { kind: 'all-keyframes' }>):
    Map<number, TrackedShape> {
        const changes = new Map<number, TrackedShape>();
        for (const frame of Object.keys(this.shapes).map(Number)) {
            const shape = this.shapes[frame];
            if (shape.outside || !shape.points) {
                continue;
            }

            const original = rectangleGeometry(shape.points as unknown as RectanglePoints);
            const width = request.resize.unit === 'pixels' ?
                original.width + request.resize.width :
                original.width * (1 + request.resize.width / 100);
            const height = request.resize.unit === 'pixels' ?
                original.height + request.resize.height :
                original.height * (1 + request.resize.height / 100);
            const points = this.fitRectangle(rectanglePoints(
                original.cx + request.translation.dx,
                original.cy + request.translation.dy,
                width,
                height,
            ), shape.rotation, frame);

            if (!samePoints(shape.points, points)) {
                changes.set(frame, { ...cloneShape(shape), points });
            }
        }
        return changes;
    }

    private transformCanvasEdit(request: Extract<RectangleTrackTransformRequest, { kind: 'canvas-edit' }>):
    Map<number, TrackedShape> {
        const frames = this.frameNumbers().filter((frame) => !this.framesInfo.isFrameDeleted(frame));
        const currentIndex = frames.indexOf(request.frame);
        const before = rectangleGeometry(request.before);
        const after = rectangleGeometry(request.after);
        const translation = {
            x: after.cx - before.cx,
            y: after.cy - before.cy,
        };
        const scale = {
            x: after.width / before.width,
            y: after.height / before.height,
        };
        const minIndex = request.propagation.direction !== 'forward' ?
            Math.max(0, currentIndex - request.propagation.radius) : currentIndex;
        const maxIndex = request.propagation.direction === 'backward' ? currentIndex :
            Math.min(frames.length - 1, currentIndex + request.propagation.radius);
        const frameIndexes = new Map(frames.map((frame, index) => [frame, index]));
        const candidateFrames = request.propagation.createKeyframes ?
            frames.slice(minIndex, maxIndex + 1) :
            [request.frame, ...Object.keys(this.shapes).map(Number).filter((frame) => {
                const index = frameIndexes.get(frame) ?? -1;
                return index >= minIndex && index <= maxIndex;
            })];
        const changes = new Map<number, TrackedShape>();

        for (const frame of new Set(candidateFrames)) {
            if (this.framesInfo.isFrameDeleted(frame)) {
                continue;
            }

            const target = this.shapeAt(frame);
            if (target.outside || !target.points) {
                continue;
            }

            const distance = Math.abs((frameIndexes.get(frame) as number) - currentIndex);
            const weight = distance ?
                (1 - distance / (request.propagation.radius + 1)) ** request.propagation.exponent : 1;
            const original = rectangleGeometry(target.points as unknown as RectanglePoints);
            const points = this.fitRectangle(rectanglePoints(
                original.cx + weight * translation.x,
                original.cy + weight * translation.y,
                original.width * (1 + weight * (scale.x - 1)),
                original.height * (1 + weight * (scale.y - 1)),
            ), target.rotation, frame);

            if (!samePoints(target.points, points) || !(frame in this.shapes)) {
                changes.set(frame, { ...target, points });
            }
        }
        return changes;
    }

    public transform(request: RectangleTrackTransformRequest): RectangleTrackTransformResult {
        this.validateRequest(request);
        const changes = request.kind === 'all-keyframes' ?
            this.transformAllKeyframes(request) : this.transformCanvasEdit(request);
        const createdKeyframes = [...changes.keys()].filter((frame) => !(frame in this.shapes)).length;
        if (!changes.size) {
            return {
                state: new ObjectState(this.get(request.frame)),
                affectedKeyframes: 0,
                createdKeyframes: 0,
            };
        }

        const undoShapes = new Map<number, TrackedShape | undefined>();
        const redoShapes = new Map<number, TrackedShape>();
        for (const [frame, shape] of changes) {
            undoShapes.set(frame, this.shapes[frame] ? cloneShape(this.shapes[frame]) : undefined);
            redoShapes.set(frame, cloneShape(shape));
        }

        const undoSource = this.source;
        const redoSource = this.readOnlyFields.includes('source') ? this.source : computeNewSource(this.source);
        const undoUpdated = this.updated;
        const redoUpdated = Date.now();
        const apply = (
            shapes: Map<number, TrackedShape | undefined>, source: Source, updated: number,
        ): void => {
            for (const [frame, shape] of shapes) {
                if (shape) {
                    this.shapes[frame] = cloneShape(shape);
                } else {
                    delete this.shapes[frame];
                }
            }
            this.source = source;
            this.updated = updated;
        };

        apply(redoShapes, redoSource, redoUpdated);
        this.history.do(
            HistoryActions.TRANSFORMED_RECTANGLE_TRACK,
            () => apply(undoShapes, undoSource, undoUpdated),
            () => apply(redoShapes, redoSource, redoUpdated),
            [this.clientID],
            request.frame,
        );

        return {
            state: new ObjectState(this.get(request.frame)),
            affectedKeyframes: changes.size,
            createdKeyframes,
        };
    }

    public metadata(): RectangleTrackMetadata {
        const frames = this.frameNumbers();
        const keyframes = Object.keys(this.shapes).map(Number).sort((left, right) => left - right);
        const navigableFrames = frames.filter((frame) => !this.framesInfo.isFrameDeleted(frame));
        const navigableFrameIndexes = new Map(navigableFrames.map((frame, index) => [frame, index]));
        const visibleSegments: RectangleTrackMetadata['visibleSegments'] = [];
        let segmentStart: number | null = null;

        for (const frame of keyframes.filter((_frame) => !this.framesInfo.isFrameDeleted(_frame))) {
            if (this.shapes[frame].outside) {
                if (segmentStart !== null) {
                    const outsideIndex = navigableFrameIndexes.get(frame) as number;
                    visibleSegments.push({
                        start: segmentStart,
                        stop: outsideIndex > 0 ? navigableFrames[outsideIndex - 1] : frame,
                    });
                    segmentStart = null;
                }
            } else if (segmentStart === null) {
                segmentStart = frame;
            }
        }
        if (segmentStart !== null) {
            visibleSegments.push({ start: segmentStart, stop: navigableFrames[navigableFrames.length - 1] });
        }

        return {
            clientID: this.clientID,
            serverID: this._serverId ?? null,
            labelID: this.label.id,
            labelName: this.label.name,
            keyframes: keyframes.map((frame) => ({
                frame,
                outside: this.shapes[frame].outside,
                deleted: this.framesInfo.isFrameDeleted(frame),
            })),
            visibleSegments,
        };
    }
}

Object.defineProperty(RectangleTrack, 'distance', { value: RectangleShape.distance });
