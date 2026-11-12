// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './rectangle-label-bar.scss';

import React, {
    useEffect, useMemo, useRef, useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from 'antd/lib/button';
import Select from 'antd/lib/select';
import notification from 'antd/lib/notification';

import { Canvas, CanvasMode, RectDrawingMethod } from 'cvat-canvas-wrapper';
import {
    Label, LabelType, ObjectType, ShapeType,
} from 'cvat-core-wrapper';
import { ActiveControl, CombinedState } from 'reducers';
import {
    interactWithCanvas, rememberObject, switchPlay, updateAnnotationsAsync,
} from 'actions/annotation-actions';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import GlobalHotKeys, { KeyMap } from 'utils/mousetrap-react';
import { ShortcutScope } from 'utils/enums';
import { shallowEqual } from 'utils/redux';
import openCVWrapper from 'utils/opencv-wrapper/opencv-wrapper';

const labelDragType = 'application/x-cvat-rectangle-label';
const digits = '12345';
const suffixes = `${digits}qwertasdfgzxcvb`;

export default function RectangleLabelBar(): JSX.Element {
    const dispatch = useDispatch<any>();
    const {
        labels, canvas, ready, frame, fetching, deleted, playing, states, drawing, activeControl, keyMap, interactors,
    } = useSelector((state: CombinedState) => ({
        labels: state.annotation.job.labels,
        canvas: state.annotation.canvas.instance as Canvas,
        ready: state.annotation.canvas.ready,
        frame: state.annotation.player.frame.number,
        fetching: state.annotation.player.frame.fetching,
        deleted: state.annotation.player.frame.data?.deleted,
        playing: state.annotation.player.playing,
        states: state.annotation.annotations.states,
        drawing: state.annotation.drawing,
        activeControl: state.annotation.canvas.activeControl,
        keyMap: state.shortcuts.keyMap,
        interactors: state.models.interactors,
    }), shallowEqual);
    const [defaultMode, setDefaultMode] = useState('manual');
    const [initializing, setInitializing] = useState(false);
    const startRequest = useRef(0);
    const draggedLabel = useRef<number | null>(null);
    const keyMapRef = useRef(keyMap);
    keyMapRef.current = keyMap;
    const disabled = !ready || fetching || deleted || initializing;
    const objectType = drawing.activeObjectType === ObjectType.TRACK ? ObjectType.TRACK : ObjectType.SHAPE;
    const segmentationModels = interactors.filter((model) => model.version >= 2 &&
        [LabelType.MASK, LabelType.ANY].includes(model.returnType));
    const mode = defaultMode.startsWith('interactor:') &&
        !segmentationModels.some((model) => `interactor:${model.id}` === defaultMode) ? 'manual' : defaultMode;
    const rectangleLabels = useMemo(() => labels.filter((label) => (
        !label.hasParent && [LabelType.ANY, LabelType.RECTANGLE].includes(label.type)
    )), [labels]);
    const shortcuts = useMemo(() => Object.fromEntries(rectangleLabels.map((label, index) => {
        const code = rectangleLabels.length <= digits.length ? digits[index] :
            `${digits[Math.floor(index / suffixes.length)] || ''}${suffixes[index % suffixes.length]}`;
        if (index >= digits.length * suffixes.length) return null;
        return [`DRAW_RECTANGLE_LABEL_${code}`, {
            name: `Draw rectangle: ${label.name}`,
            description: `Select ${label.name} and start the class strip's default rectangle mode (keys in sequence)`,
            sequences: [code.split('').join(' ')],
            scope: ShortcutScope.ANNOTATION_PAGE,
        }];
    }).filter(Boolean)) as KeyMap, [rectangleLabels]);

    useEffect(() => {
        registerComponentShortcuts(Object.fromEntries(Object.entries(shortcuts).map(([key, value]) => (
            [key, { ...value, sequences: keyMapRef.current[key]?.sequences ?? value.sequences }]
        ))));
        return () => {
            registerComponentShortcuts(Object.fromEntries(Object.entries(shortcuts).map(([key, value]) => (
                [key, { ...keyMapRef.current[key] ?? value, nonActive: true }]
            ))));
        };
    }, [shortcuts]);

    useEffect(() => {
        draggedLabel.current = null;
        startRequest.current += 1;
        setInitializing(false);
    }, [frame, labels]);

    useEffect(() => {
        const cancelStart = (): void => {
            startRequest.current += 1;
            setInitializing(false);
        };
        cancelStart();
        canvas?.html().addEventListener('canvas.canceled', cancelStart);
        return () => {
            startRequest.current += 1;
            canvas?.html().removeEventListener('canvas.canceled', cancelStart);
        };
    }, [canvas, ready, fetching, deleted]);

    useEffect(() => {
        if (!canvas) return undefined;
        const root = canvas.html();
        let highlighted: Element | null = null;
        const highlight = (element: Element | null): void => {
            highlighted?.classList.remove('cvat-rectangle-label-drop-target');
            highlighted = element;
            highlighted?.classList.add('cvat-rectangle-label-drop-target');
        };
        const targetAt = (event: DragEvent): typeof states[number] | undefined => {
            if (disabled || playing || canvas.mode() !== CanvasMode.IDLE || draggedLabel.current === null) {
                return undefined;
            }
            // Use the rendered SVG hit area, including rotation, zoom and stacking order.
            // Never fall through a locked or incompatible foreground object to a box behind it.
            const element = document.elementsFromPoint(event.clientX, event.clientY)
                .find((candidate) => root.contains(candidate) && candidate.matches('.cvat_canvas_shape'));
            const state = states.find((candidate) => element?.id === `cvat_canvas_shape_${candidate.clientID}`);
            if (state?.shapeType === ShapeType.RECTANGLE && !state.lock && !state.hidden &&
                !state.outside && !state.isGroundTruth) {
                return state;
            }
            return undefined;
        };
        const onDragOver = (event: DragEvent): void => {
            const state = targetAt(event);
            highlight(state ? root.querySelector(`#cvat_canvas_shape_${state.clientID}`) : null);
            if (state) {
                event.preventDefault();
                const { dataTransfer } = event;
                dataTransfer.dropEffect = 'copy';
            }
        };
        const clearHighlight = (): void => highlight(null);
        const onDrop = (event: DragEvent): void => {
            const state = targetAt(event);
            const label = rectangleLabels.find((candidate) => candidate.id === draggedLabel.current);
            highlight(null);
            draggedLabel.current = null;
            if (state && label && event.dataTransfer.getData(labelDragType) === `${label.id}`) {
                event.preventDefault();
                if (state.label.id !== label.id) {
                    state.label = label;
                    dispatch(updateAnnotationsAsync([state]));
                }
            }
        };
        root.addEventListener('dragover', onDragOver);
        root.addEventListener('dragleave', clearHighlight);
        root.addEventListener('drop', onDrop);
        document.addEventListener('dragend', clearHighlight);
        return () => {
            clearHighlight();
            root.removeEventListener('dragover', onDragOver);
            root.removeEventListener('dragleave', clearHighlight);
            root.removeEventListener('drop', onDrop);
            document.removeEventListener('dragend', clearHighlight);
        };
    }, [canvas, disabled, playing, states, rectangleLabels]);

    const startDrawing = async (label: Label, selectedMode = mode): Promise<void> => {
        if (disabled) return;
        dispatch(switchPlay(false));
        canvas.cancel();
        if (selectedMode !== 'manual') {
            const request = ++startRequest.current;
            setInitializing(true);
            try {
                await openCVWrapper.initialize(() => {});
                if (startRequest.current !== request) return;
                dispatch(rememberObject({
                    activeLabelID: label.id,
                    activeObjectType: ObjectType.SHAPE,
                    activeShapeType: ShapeType.RECTANGLE,
                }, false));
                if (selectedMode === 'scissors') {
                    const tool = openCVWrapper.segmentation.intelligentScissorsFactory('rectangle');
                    const parameters = {
                        command: 'draw_points' as const,
                        settings: {
                            appendCursorPositionAsPoint: true,
                            removalStrategy: 'last' as const,
                            points_type: 'positive' as const,
                            hint: 'Click along object edges; press N or Done to create their bounding box',
                        },
                    };
                    dispatch(interactWithCanvas(tool, label.id, parameters, ShapeType.RECTANGLE));
                    canvas.interact({ enabled: true, ...parameters });
                } else {
                    const model = segmentationModels.find((candidate) => `interactor:${candidate.id}` === selectedMode);
                    if (!model) return;
                    const startWithBox = model.params.canvas.startWithBox && !model.params.canvas.startWithBoxOptional;
                    const parameters = {
                        command: startWithBox ? 'draw_box' as const : 'draw_points' as const,
                        settings: {
                            appendCursorPositionAsPoint: false,
                            removalStrategy: 'any' as const,
                            points_type: 'any' as const,
                            crosshair: !!startWithBox,
                        },
                    };
                    dispatch(interactWithCanvas(model, label.id, parameters, ShapeType.RECTANGLE));
                    canvas.interact({ enabled: true, ...parameters });
                }
            } catch (error: unknown) {
                if (startRequest.current === request) {
                    notification.error({
                        message: 'Could not start assisted rectangle',
                        description: error instanceof Error ? error.message : String(error),
                    });
                }
            } finally {
                if (startRequest.current === request) setInitializing(false);
            }
            return;
        }
        canvas.draw({
            enabled: true,
            shapeType: ShapeType.RECTANGLE,
            rectDrawingMethod: RectDrawingMethod.CLASSIC,
            crosshair: true,
        });
        dispatch(rememberObject({
            activeLabelID: label.id,
            activeObjectType: objectType,
            activeShapeType: ShapeType.RECTANGLE,
            activeRectDrawingMethod: RectDrawingMethod.CLASSIC,
        }));
    };
    const shortcutKeys = Object.keys(shortcuts);
    const effectiveShortcuts = Object.fromEntries(shortcutKeys.map((key) => [key, keyMap[key] ?? shortcuts[key]]));

    return (
        <section className='cvat-rectangle-label-bar' aria-label='Rectangle classes' hidden={!rectangleLabels.length}>
            <GlobalHotKeys
                keyMap={effectiveShortcuts}
                handlers={Object.fromEntries(shortcutKeys.map((key, index) => [key, (event: KeyboardEvent) => {
                    if (!event.repeat) startDrawing(rectangleLabels[index]);
                }]))}
            />
            <div className='cvat-rectangle-label-bar-heading'>
                <strong>New rectangle</strong>
                <Select
                    aria-label='Default rectangle action'
                    className='cvat-rectangle-label-mode'
                    size='small'
                    popupMatchSelectWidth={false}
                    value={mode}
                    disabled={disabled}
                    options={[
                        { value: 'manual', label: 'Manual rectangle' },
                        { value: 'scissors', label: 'Scissors rectangle' },
                        ...segmentationModels.map((model) => ({
                            value: `interactor:${model.id}`, label: `Assisted box: ${model.name}`,
                        })),
                        ...(!segmentationModels.length ? [{
                            value: 'unavailable', label: 'Assisted box (no interactor configured)', disabled: true,
                        }] : []),
                    ]}
                    onChange={(value: string) => {
                        setDefaultMode(value);
                        if (value !== 'manual') {
                            dispatch(rememberObject({ ...drawing, activeObjectType: ObjectType.SHAPE }, false));
                        }
                    }}
                />
                <Select
                    aria-label='New rectangle object type'
                    size='small'
                    value={mode === 'manual' ? objectType : ObjectType.SHAPE}
                    disabled={disabled || mode !== 'manual'}
                    options={[{ value: ObjectType.SHAPE, label: 'Shape' }, { value: ObjectType.TRACK, label: 'Track' }]}
                    onChange={(value: ObjectType) => dispatch(rememberObject({
                        ...drawing, activeObjectType: value,
                    }, false))}
                />
                <span>
                    {initializing ? 'Loading OpenCV…' :
                        'Click or type a class code: default action. Right-click: scissors rectangle. Drag: relabel.'}
                </span>
            </div>
            <div className='cvat-rectangle-label-bar-labels'>
                {rectangleLabels.map((label, index) => {
                    const shortcut = effectiveShortcuts[shortcutKeys[index]]?.sequences.join(' / ').toUpperCase();
                    const active = drawing.activeLabelID === label.id && (
                        activeControl === ActiveControl.DRAW_RECTANGLE ||
                        (activeControl === ActiveControl.OPENCV_TOOLS &&
                            drawing.activeInteractor?.kind === 'opencv_scissors_rectangle') ||
                        (activeControl === ActiveControl.AI_TOOLS &&
                            drawing.activeInteractorShapeType === ShapeType.RECTANGLE)
                    );
                    return (
                        <Button
                            key={label.id}
                            size='small'
                            type={active ? 'primary' : 'default'}
                            className='cvat-rectangle-label-button'
                            aria-label={`Draw ${label.name}`}
                            aria-pressed={active}
                            title={`Draw ${label.name}${shortcut ? ` (${shortcut})` : ''}; right-click: scissors rectangle; drag: relabel`}
                            disabled={disabled}
                            draggable={!disabled}
                            onClick={() => startDrawing(label)}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                startDrawing(label, 'scissors');
                            }}
                            onDragStart={(event) => {
                                dispatch(switchPlay(false));
                                canvas.cancel();
                                draggedLabel.current = label.id;
                                const { dataTransfer } = event;
                                dataTransfer.setData(labelDragType, `${label.id}`);
                                dataTransfer.effectAllowed = 'copy';
                            }}
                            onDragEnd={() => { draggedLabel.current = null; }}
                        >
                            <span className='cvat-rectangle-label-color' style={{ backgroundColor: label.color }} />
                            <span className='cvat-rectangle-label-name'>{label.name}</span>
                            {shortcut && <kbd>{shortcut}</kbd>}
                        </Button>
                    );
                })}
            </div>
        </section>
    );
}
