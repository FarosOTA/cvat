// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './rectangle-track-tools.scss';

import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import InputNumber from 'antd/lib/input-number';
import Modal from 'antd/lib/modal';
import Radio from 'antd/lib/radio';
import Select from 'antd/lib/select';
import Slider from 'antd/lib/slider';
import Switch from 'antd/lib/switch';
import Text from 'antd/lib/typography/Text';

import {
    ObjectState, ObjectType, RectangleTrackMetadata, ShapeType,
} from 'cvat-core-wrapper';
import {
    CombinedState, RectangleTrackPropagationSettings, Workspace,
} from 'reducers';
import {
    changeFrameAsync, setRectangleTrackPropagation, transformRectangleTrackAsync,
} from 'actions/annotation-actions';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import GlobalHotKeys from 'utils/mousetrap-react';
import { subKeyMap } from 'utils/component-subkeymap';
import { ShortcutScope } from 'utils/enums';

const componentShortcuts = {
    TRACK_START: {
        name: 'Track start',
        description: 'Go to the first visible frame of the active track',
        sequences: ['shift+e'],
        scope: ShortcutScope.OBJECTS_SIDEBAR,
    },
    TRACK_END: {
        name: 'Track end',
        description: 'Go to the last visible frame of the active track',
        sequences: ['shift+r'],
        scope: ShortcutScope.OBJECTS_SIDEBAR,
    },
};

registerComponentShortcuts(componentShortcuts);

type ResizeUnit = 'pixels' | 'percent';

function eligibleTrack(state: ObjectState | undefined, workspace: Workspace): state is ObjectState {
    return workspace === Workspace.STANDARD && !!state &&
        state.objectType === ObjectType.TRACK &&
        state.shapeType === ShapeType.RECTANGLE &&
        !state.lock && !state.isGroundTruth;
}

export default function RectangleTrackTools(): JSX.Element {
    const dispatch = useDispatch<any>();
    const {
        activeID,
        states,
        frame,
        frameNumbers,
        jobInstance,
        keyMap,
        propagation,
        workspace,
        reverseAnnotation,
    } = useSelector((state: CombinedState) => ({
        activeID: state.annotation.annotations.activatedStateID,
        states: state.annotation.annotations.states,
        frame: state.annotation.player.frame.number,
        frameNumbers: state.annotation.job.frameNumbers,
        jobInstance: state.annotation.job.instance,
        keyMap: state.shortcuts.keyMap,
        propagation: state.annotation.rectangleTrack.propagation,
        workspace: state.annotation.workspace,
        reverseAnnotation: state.settings.player.reverseAnnotation,
    }));
    const activeState = states.find((state: ObjectState) => state.clientID === activeID);
    const eligible = eligibleTrack(activeState, workspace);
    const [metadata, setMetadata] = useState<RectangleTrackMetadata | null>(null);
    const [dx, setDX] = useState(0);
    const [dy, setDY] = useState(0);
    const [resizeWidth, setResizeWidth] = useState(0);
    const [resizeHeight, setResizeHeight] = useState(0);
    const [resizeUnit, setResizeUnit] = useState<ResizeUnit>('pixels');

    useEffect(() => {
        let active = true;
        if (!eligible || !jobInstance) {
            setMetadata(null);
            return () => { active = false; };
        }

        jobInstance.annotations.rectangleTrackMetadata(activeState.clientID as number)
            .then(([result]) => {
                if (active) setMetadata(result ?? null);
            })
            .catch(() => {
                if (active) setMetadata(null);
            });
        return () => { active = false; };
    }, [eligible, jobInstance, activeState]);

    const visibleKeyframes = metadata?.keyframes.filter((keyframe) => !keyframe.outside) ?? [];
    const deletedKeyframes = visibleKeyframes.filter((keyframe) => keyframe.deleted).length;
    const lower = metadata?.visibleSegments[0]?.start ?? null;
    const upper = metadata?.visibleSegments[metadata.visibleSegments.length - 1]?.stop ?? null;
    const visibleStart = reverseAnnotation ? upper : lower;
    const visibleStop = reverseAnnotation ? lower : upper;
    const createdKeyframesEstimate = useMemo(() => {
        if (!metadata || !propagation.createKeyframes) return 0;
        const currentIndex = frameNumbers.indexOf(frame);
        const firstIndex = propagation.mode === 'both' || reverseAnnotation ?
            Math.max(0, currentIndex - propagation.radius) : currentIndex;
        const lastIndex = propagation.mode === 'both' || !reverseAnnotation ?
            Math.min(frameNumbers.length - 1, currentIndex + propagation.radius) : currentIndex;
        const existing = new Set(metadata.keyframes.map((keyframe) => keyframe.frame));
        return frameNumbers.slice(firstIndex, lastIndex + 1)
            .filter((candidate) => !existing.has(candidate)).length;
    }, [frame, frameNumbers, metadata, propagation, reverseAnnotation]);

    const updatePropagation = (settings: Partial<RectangleTrackPropagationSettings>): void => {
        dispatch(setRectangleTrackPropagation(settings));
    };

    const toggleKeyframeCreation = (checked: boolean): void => {
        if (!checked) {
            updatePropagation({ createKeyframes: false });
            return;
        }

        Modal.confirm({
            title: 'Create keyframes during propagation?',
            content: (
                <div>
                    This can substantially increase annotation size by creating a stored keyframe on every
                    affected, non-deleted frame. Interpolation will no longer control those frames.
                </div>
            ),
            okText: 'Enable keyframe creation',
            okType: 'danger',
            onOk: () => updatePropagation({ createKeyframes: true }),
        });
    };

    const applyBatchTransform = (): void => {
        if (!eligible) return;
        dispatch(transformRectangleTrackAsync(activeState, {
            kind: 'all-keyframes',
            frame,
            translation: { dx, dy },
            resize: {
                unit: resizeUnit,
                width: resizeWidth,
                height: resizeHeight,
            },
        }));
    };

    const navigate = (target: number | null): void => {
        if (target !== null && target !== frame) dispatch(changeFrameAsync(target));
    };

    const handlers = {
        TRACK_START: (event?: KeyboardEvent) => {
            event?.preventDefault();
            if (eligible) navigate(visibleStart);
        },
        TRACK_END: (event?: KeyboardEvent) => {
            event?.preventDefault();
            if (eligible) navigate(visibleStop);
        },
    };

    if (!eligible) {
        return (
            <div className='cvat-rectangle-track-tools cvat-rectangle-track-tools-empty'>
                <GlobalHotKeys keyMap={subKeyMap(componentShortcuts, keyMap)} handlers={handlers} />
                Select an unlocked rectangle track to edit its keyframes.
            </div>
        );
    }

    const falloffPreview = Array.from({ length: 8 }, (_, index) => (
        1 - index / 8
    ) ** propagation.exponent);

    return (
        <div className='cvat-rectangle-track-tools'>
            <GlobalHotKeys keyMap={subKeyMap(componentShortcuts, keyMap)} handlers={handlers} />
            <div className='cvat-rectangle-track-tools-heading'>
                <Text strong>{activeState.label.name}</Text>
                <Text type='secondary'>Track #{activeState.clientID}</Text>
            </div>

            <div className='cvat-rectangle-track-tools-navigation'>
                <Button size='small' disabled={visibleStart === null || visibleStart === frame} onClick={() => navigate(visibleStart)}>
                    Track start
                </Button>
                <Button size='small' disabled={visibleStop === null || visibleStop === frame} onClick={() => navigate(visibleStop)}>
                    Track end
                </Button>
            </div>

            <section>
                <Text strong>All keyframes</Text>
                <div className='cvat-rectangle-track-tools-grid'>
                    <div className='cvat-rectangle-track-tools-field'>
                        Move X (px)
                        <InputNumber value={dx} onChange={(value) => setDX(value ?? 0)} />
                    </div>
                    <div className='cvat-rectangle-track-tools-field'>
                        Move Y (px)
                        <InputNumber value={dy} onChange={(value) => setDY(value ?? 0)} />
                    </div>
                    <div className='cvat-rectangle-track-tools-field'>
                        Resize unit
                        <Select
                            value={resizeUnit}
                            onChange={setResizeUnit}
                            options={[
                                { value: 'pixels', label: 'Pixels' },
                                { value: 'percent', label: 'Percent' },
                            ]}
                        />
                    </div>
                    <span />
                    <div className='cvat-rectangle-track-tools-field'>
                        Width {resizeUnit === 'pixels' ? '(px)' : '(%)'}
                        <InputNumber value={resizeWidth} onChange={(value) => setResizeWidth(value ?? 0)} />
                    </div>
                    <div className='cvat-rectangle-track-tools-field'>
                        Height {resizeUnit === 'pixels' ? '(px)' : '(%)'}
                        <InputNumber value={resizeHeight} onChange={(value) => setResizeHeight(value ?? 0)} />
                    </div>
                </div>
                <Alert
                    type='info'
                    showIcon
                    message={`${visibleKeyframes.length} keyframes will be considered`}
                    description={deletedKeyframes ?
                        `${deletedKeyframes} are on deleted frames and will be included.` : undefined}
                />
                <Button
                    block
                    type='primary'
                    disabled={!dx && !dy && !resizeWidth && !resizeHeight}
                    onClick={applyBatchTransform}
                >
                    Apply to track
                </Button>
            </section>

            <section>
                <Text strong>Canvas edit propagation</Text>
                <Radio.Group
                    optionType='button'
                    buttonStyle='solid'
                    value={propagation.mode}
                    onChange={(event) => updatePropagation({ mode: event.target.value })}
                    options={[
                        { value: 'off', label: 'Off' },
                        { value: 'forward', label: 'Forward' },
                        { value: 'both', label: 'Both' },
                    ]}
                />
                <div className='cvat-rectangle-track-tools-field'>
                    Frame radius
                    <div className='cvat-rectangle-track-tools-slider-row'>
                        <Slider
                            min={1}
                            max={Math.max(1, Math.min(100, frameNumbers.length - 1))}
                            value={propagation.radius}
                            disabled={propagation.mode === 'off'}
                            onChange={(radius) => updatePropagation({ radius })}
                        />
                        <InputNumber
                            min={1}
                            max={Math.max(1, frameNumbers.length - 1)}
                            value={propagation.radius}
                            disabled={propagation.mode === 'off'}
                            onChange={(radius) => updatePropagation({ radius: radius ?? 1 })}
                        />
                    </div>
                </div>
                <div className='cvat-rectangle-track-tools-field'>
                    Falloff
                    <Slider
                        min={0.25}
                        max={4}
                        step={0.25}
                        value={propagation.exponent}
                        disabled={propagation.mode === 'off'}
                        marks={{ 0.25: 'Gentle', 1: 'Linear', 4: 'Steep' }}
                        onChange={(exponent) => updatePropagation({ exponent })}
                    />
                </div>
                <div className='cvat-rectangle-track-falloff-preview'>
                    {falloffPreview.map((weight, index) => (
                        <span key={index} style={{ height: `${Math.max(4, weight * 28)}px` }} />
                    ))}
                </div>
                <div className='cvat-rectangle-track-keyframe-toggle'>
                    <span>
                        Create keyframes
                        {propagation.createKeyframes && createdKeyframesEstimate > 0 ?
                            ` (up to ${createdKeyframesEstimate})` : ''}
                    </span>
                    <Switch
                        checked={propagation.createKeyframes}
                        disabled={propagation.mode === 'off'}
                        onChange={toggleKeyframeCreation}
                    />
                </div>
                <Text type='secondary'>
                    Deleted frames are excluded. Existing keyframes are updated by default.
                </Text>
            </section>
        </div>
    );
}
