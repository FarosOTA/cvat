// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './rectangle-track-timeline.scss';

import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    CaretDownOutlined, CaretUpOutlined, LeftOutlined, RightOutlined,
} from '@ant-design/icons';
import Button from 'antd/lib/button';
import Select from 'antd/lib/select';

import {
    FramesMetaData, getCore, ObjectType, RectangleMetadata,
} from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';
import {
    navigateAnnotationFrameAsync, navigateToRectangleAsync,
} from 'actions/annotation-actions';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import GlobalHotKeys from 'utils/mousetrap-react';
import { subKeyMap } from 'utils/component-subkeymap';
import { ShortcutScope } from 'utils/enums';
import { shallowEqual } from 'utils/redux';

const componentShortcuts = {
    PREVIOUS_ANNOTATION_FRAME: {
        name: 'Previous annotation frame',
        description: 'Go to the previous frame containing an annotation in the timeline label scope',
        sequences: ['['],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
    NEXT_ANNOTATION_FRAME: {
        name: 'Next annotation frame',
        description: 'Go to the next frame containing an annotation in the timeline label scope',
        sequences: [']'],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
    PREVIOUS_RECTANGLE_TRACK: {
        name: 'Previous rectangle',
        description: 'Activate the previous rectangle shape or track in the timeline label scope',
        sequences: ['shift+['],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
    NEXT_RECTANGLE_TRACK: {
        name: 'Next rectangle',
        description: 'Activate the next rectangle shape or track in the timeline label scope',
        sequences: ['shift+]'],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
};

registerComponentShortcuts(componentShortcuts);

function pathForKeyframes(
    keyframes: RectangleMetadata['keyframes'],
    frameIndexes: Map<number, number>,
    frameCount: number,
): string {
    return keyframes.map(({ frame }) => {
        const x = (((frameIndexes.get(frame) ?? 0) + 0.5) / Math.max(1, frameCount)) * 1000;
        return `M ${x} 0 V 24`;
    }).join(' ');
}

export default function RectangleTrackTimeline(): JSX.Element {
    const dispatch = useDispatch<any>();
    const {
        activeID, frame, frameNumbers, jobInstance, keyMap, metadataRevision,
    } = useSelector((state: CombinedState) => ({
        activeID: state.annotation.annotations.activatedStateID,
        frame: state.annotation.player.frame.number,
        frameNumbers: state.annotation.job.frameNumbers,
        jobInstance: state.annotation.job.instance,
        keyMap: state.shortcuts.keyMap,
        metadataRevision: state.annotation.rectangleTrack.metadataRevision,
    }), shallowEqual);
    const [expanded, setExpanded] = useState(false);
    const [labelID, setLabelID] = useState<number | null>(null);
    const [rectangles, setRectangles] = useState<RectangleMetadata[]>([]);
    const [deletedFrames, setDeletedFrames] = useState<FramesMetaData['deletedFrames'] | null>(null);

    useEffect(() => {
        let active = true;
        if (!jobInstance) return () => { active = false; };
        jobInstance.annotations.rectangleMetadata()
            .then((metadata) => {
                if (active) setRectangles(metadata);
            })
            .catch(() => {
                if (active) setRectangles([]);
            });
        return () => { active = false; };
    }, [jobInstance, metadataRevision]);

    useEffect(() => {
        let active = true;
        if (!jobInstance) return () => { active = false; };
        getCore().frames.getMeta('job', jobInstance.id)
            .then((metadata) => {
                if (active) setDeletedFrames(metadata.deletedFrames);
            })
            .catch(() => {
                if (active) setDeletedFrames(null);
            });
        return () => { active = false; };
    }, [frame, jobInstance, metadataRevision]);

    const filteredRectangles = useMemo(() => rectangles.filter((rectangle) => (
        labelID === null || rectangle.labelID === labelID
    )), [labelID, rectangles]);
    const labelRows = useMemo(() => {
        const groups = new Map<number, RectangleMetadata[]>();
        filteredRectangles.forEach((rectangle) => {
            const group = groups.get(rectangle.labelID);
            if (group) group.push(rectangle);
            else groups.set(rectangle.labelID, [rectangle]);
        });
        return Array.from(groups.values());
    }, [filteredRectangles]);
    const trackCount = useMemo(() => filteredRectangles.filter((rectangle) => (
        rectangle.objectType === ObjectType.TRACK
    )).length, [filteredRectangles]);
    const shapeCount = filteredRectangles.length - trackCount;
    const frameIndexes = useMemo(() => new Map(frameNumbers.map((number, index) => (
        [number, index]
    ))), [frameNumbers]);
    const navigableFrameNumbers = useMemo(() => (deletedFrames ?
        frameNumbers.filter((candidate) => !deletedFrames[candidate]) : []), [deletedFrames, frameNumbers]);
    const currentPosition = (((frameIndexes.get(frame) ?? 0) + 0.5) / Math.max(1, frameNumbers.length)) * 100;
    const labelOptions = useMemo(() => [
        { value: 'any', label: 'Any label' },
        ...jobInstance.labels.map((label) => ({ value: `${label.id}`, label: label.name })),
    ], [jobInstance]);

    const navigateAnnotation = (direction: 'forward' | 'backward'): void => {
        dispatch(navigateAnnotationFrameAsync(direction, labelID));
    };

    const segmentFrames = (segment: RectangleMetadata['visibleSegments'][0]): number[] => (
        navigableFrameNumbers.filter((candidate) => candidate >= segment.start && candidate <= segment.stop)
    );

    const visibleRectangleFrames = (rectangle: RectangleMetadata): number[] => (
        rectangle.visibleSegments.flatMap(segmentFrames)
    );

    const nearestFrame = (candidates: number[], preferredFrame: number): number | null => {
        if (!candidates.length) return null;
        const preferredIndex = frameIndexes.get(preferredFrame);
        if (typeof preferredIndex === 'undefined') return candidates[0];

        return candidates.reduce((nearest, candidate) => {
            const candidateDistance = Math.abs((frameIndexes.get(candidate) as number) - preferredIndex);
            const nearestDistance = Math.abs((frameIndexes.get(nearest) as number) - preferredIndex);
            return candidateDistance < nearestDistance ? candidate : nearest;
        });
    };

    const rectangleFrame = (rectangle: RectangleMetadata): number | null => {
        const candidates = visibleRectangleFrames(rectangle);
        return candidates.includes(frame) ? frame : nearestFrame(candidates, frame);
    };

    const navigateRectangle = (rectangle: RectangleMetadata, targetFrame?: number): void => {
        const destination = typeof targetFrame === 'undefined' ?
            rectangleFrame(rectangle) : nearestFrame(visibleRectangleFrames(rectangle), targetFrame);
        if (destination !== null) {
            dispatch(navigateToRectangleAsync(destination, rectangle.clientID));
        }
    };

    const navigateLabel = (group: RectangleMetadata[], targetFrame?: number): void => {
        const candidates = group.filter((rectangle) => {
            const frames = visibleRectangleFrames(rectangle);
            return typeof targetFrame === 'undefined' ? frames.length : frames.includes(targetFrame);
        });
        if (!candidates.length) return;
        const currentIndex = candidates.findIndex((rectangle) => rectangle.clientID === activeID);
        const target = candidates[(currentIndex + 1) % candidates.length];
        navigateRectangle(target, targetFrame);
    };

    const navigateAdjacentRectangle = (direction: 'forward' | 'backward'): void => {
        const activatableRectangles = filteredRectangles.filter((rectangle) => (
            visibleRectangleFrames(rectangle).length
        ));
        const currentIndex = activatableRectangles.findIndex((rectangle) => rectangle.clientID === activeID);
        let targetIndex = currentIndex + 1;
        if (direction === 'backward') {
            targetIndex = currentIndex === -1 ? activatableRectangles.length - 1 : currentIndex - 1;
        }
        const target = activatableRectangles[targetIndex];
        if (target) navigateRectangle(target);
    };

    const handlers = {
        PREVIOUS_ANNOTATION_FRAME: (event?: KeyboardEvent) => {
            event?.preventDefault();
            navigateAnnotation('backward');
        },
        NEXT_ANNOTATION_FRAME: (event?: KeyboardEvent) => {
            event?.preventDefault();
            navigateAnnotation('forward');
        },
        PREVIOUS_RECTANGLE_TRACK: (event?: KeyboardEvent) => {
            event?.preventDefault();
            navigateAdjacentRectangle('backward');
        },
        NEXT_RECTANGLE_TRACK: (event?: KeyboardEvent) => {
            event?.preventDefault();
            navigateAdjacentRectangle('forward');
        },
    };

    return (
        <div className={`cvat-rectangle-track-timeline ${expanded ? 'cvat-rectangle-track-timeline-expanded' : ''}`}>
            <GlobalHotKeys keyMap={subKeyMap(componentShortcuts, keyMap)} handlers={handlers} />
            <div className='cvat-rectangle-track-timeline-header'>
                <Button
                    type='text'
                    size='small'
                    icon={expanded ? <CaretDownOutlined /> : <CaretUpOutlined />}
                    onClick={() => setExpanded(!expanded)}
                >
                    Track timeline
                </Button>
                <Select
                    size='small'
                    value={labelID === null ? 'any' : `${labelID}`}
                    options={labelOptions}
                    onChange={(value) => setLabelID(value === 'any' ? null : +value)}
                />
                <Button.Group>
                    <Button size='small' title='Previous annotation frame ([)' onClick={() => navigateAnnotation('backward')}>
                        <LeftOutlined />
                    </Button>
                    <Button size='small' title='Next annotation frame (])' onClick={() => navigateAnnotation('forward')}>
                        <RightOutlined />
                    </Button>
                </Button.Group>
                <span>{`${trackCount} tracks · ${shapeCount} shapes`}</span>
            </div>
            {expanded && (
                <div className='cvat-rectangle-track-timeline-body'>
                    {labelRows.length ? labelRows.map((group) => (
                        <div
                            className={`cvat-rectangle-track-timeline-row ${
                                group.some((rectangle) => rectangle.clientID === activeID) ?
                                    'cvat-rectangle-track-timeline-row-active' : ''
                            }`}
                            key={group[0].labelID}
                            data-label-id={group[0].labelID}
                        >
                            <button
                                type='button'
                                className='cvat-rectangle-track-timeline-label'
                                title={`Cycle through rectangles labeled ${group[0].labelName}`}
                                onClick={() => navigateLabel(group)}
                            >
                                <span>{group[0].labelName}</span>
                                <small>{group.length}</small>
                            </button>
                            <div className='cvat-rectangle-track-timeline-track'>
                                {group.flatMap((rectangle) => rectangle.visibleSegments.map((segment) => {
                                    const startIndex = frameIndexes.get(segment.start) ?? 0;
                                    const stopIndex = frameIndexes.get(segment.stop) ?? startIndex;
                                    const left = (startIndex / Math.max(1, frameNumbers.length)) * 100;
                                    const width = ((stopIndex - startIndex + 1) /
                                        Math.max(1, frameNumbers.length)) * 100;
                                    return (
                                        <button
                                            type='button'
                                            className='cvat-rectangle-track-timeline-segment'
                                            key={`${rectangle.clientID}-${segment.start}-${segment.stop}`}
                                            data-object-type={rectangle.objectType}
                                            data-client-id={rectangle.clientID}
                                            data-active={rectangle.clientID === activeID}
                                            style={{ left: `${left}%`, width: `${Math.max(0.3, width)}%` }}
                                            title={segment.start === segment.stop ?
                                                `Frame ${segment.start}` : `Frames ${segment.start}–${segment.stop}`}
                                            onClick={(event) => {
                                                const bounds = event.currentTarget.getBoundingClientRect();
                                                const offset = Math.max(
                                                    0, (event.clientX - bounds.left) / bounds.width,
                                                );
                                                const segmentLength = stopIndex - startIndex + 1;
                                                const targetIndex = Math.min(
                                                    stopIndex, startIndex + Math.floor(offset * segmentLength),
                                                );
                                                const destination = nearestFrame(
                                                    segmentFrames(segment), frameNumbers[targetIndex],
                                                );
                                                if (destination !== null) navigateLabel(group, destination);
                                            }}
                                        />
                                    );
                                }))}
                                <svg viewBox='0 0 1000 24' preserveAspectRatio='none' aria-hidden='true'>
                                    <path
                                        className='cvat-rectangle-track-timeline-keyframes'
                                        d={pathForKeyframes(
                                            group.flatMap((rectangle) => rectangle.keyframes).filter((keyframe) => (
                                                !keyframe.outside && !keyframe.deleted
                                            )),
                                            frameIndexes,
                                            frameNumbers.length,
                                        )}
                                    />
                                    <path
                                        className='cvat-rectangle-track-timeline-keyframes-special'
                                        d={pathForKeyframes(
                                            group.flatMap((rectangle) => rectangle.keyframes).filter((keyframe) => (
                                                keyframe.outside || keyframe.deleted
                                            )),
                                            frameIndexes,
                                            frameNumbers.length,
                                        )}
                                    />
                                </svg>
                                <span className='cvat-rectangle-track-timeline-playhead' style={{ left: `${currentPosition}%` }} />
                            </div>
                        </div>
                    )) : (
                        <div className='cvat-rectangle-track-timeline-empty'>No rectangles in this label scope.</div>
                    )}
                </div>
            )}
        </div>
    );
}
