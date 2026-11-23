// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './rectangle-label-bar.scss';

import React, {
    useEffect, useMemo, useRef, useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from 'antd/lib/button';
import Select, { type RefSelectProps } from 'antd/lib/select';
import Switch from 'antd/lib/switch';

import { Canvas, CanvasMode, RectDrawingMethod } from 'cvat-canvas-wrapper';
import {
    Label, LabelType, ObjectType, ShapeType,
} from 'cvat-core-wrapper';
import { ActiveControl, CombinedState } from 'reducers';
import {
    startRectangleInteractionAsync, rememberObject, switchPlay, updateAnnotationsAsync,
    setDrawingOccluded, setContinuedTrack,
} from 'actions/annotation-actions';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import GlobalHotKeys, { KeyMap } from 'utils/mousetrap-react';
import { ShortcutScope } from 'utils/enums';
import { shallowEqual } from 'utils/redux';

const labelDragType = 'application/x-cvat-rectangle-label';
const digits = '12345';
const suffixes = `${digits}qwertasdfgzxcvb`;

const componentShortcuts: KeyMap = {
    OPEN_RECTANGLE_ACTION: {
        name: 'Choose rectangle action',
        description: 'Open the default rectangle action dropdown, with or without a selected class',
        sequences: ['alt+s'],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
};

registerComponentShortcuts(componentShortcuts);

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
    const defaultMode = drawing.rectangleMode ?? 'manual';
    const [initializing, setInitializing] = useState(false);
    const [modeSelectOpen, setModeSelectOpen] = useState(false);
    const modeSelect = useRef<RefSelectProps>(null);
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
    useEffect(() => {
        if (mode !== defaultMode) dispatch(rememberObject({ ...drawing, rectangleMode: mode }, false));
    }, [mode, defaultMode]);
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
                await dispatch(startRectangleInteractionAsync(selectedMode, label.id, objectType));
            } finally {
                if (startRequest.current === request) setInitializing(false);
            }
            return;
        }
        canvas.draw({
            enabled: true,
            shapeType: ShapeType.RECTANGLE,
            labelName: label.name,
            labelColor: label.color,
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
                keyMap={{
                    ...effectiveShortcuts,
                    OPEN_RECTANGLE_ACTION: keyMap.OPEN_RECTANGLE_ACTION ?? componentShortcuts.OPEN_RECTANGLE_ACTION,
                }}
                handlers={{
                    ...Object.fromEntries(shortcutKeys.map((key, index) => [key, (event: KeyboardEvent) => {
                        if (!event.repeat) startDrawing(rectangleLabels[index]);
                    }])),
                    OPEN_RECTANGLE_ACTION: (event: KeyboardEvent) => {
                        if (!event.repeat && !disabled && rectangleLabels.length) {
                            modeSelect.current?.focus();
                            setModeSelectOpen(true);
                        }
                    },
                }}
            />
            <div className='cvat-rectangle-label-bar-heading'>
                <strong>New rectangle</strong>
                <Select
                    ref={modeSelect}
                    aria-label='Default rectangle action'
                    className='cvat-rectangle-label-mode'
                    size='small'
                    popupMatchSelectWidth={false}
                    value={mode}
                    disabled={disabled}
                    open={modeSelectOpen}
                    onDropdownVisibleChange={setModeSelectOpen}
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
                        canvas.cancel();
                        dispatch(rememberObject({ rectangleMode: value, activeObjectType: objectType }, false));
                    }}
                    onSelect={() => {
                        modeSelect.current?.blur();
                        // rc-select also restores focus from popup mousedown in a timer.
                        setTimeout(() => modeSelect.current?.blur(), 0);
                    }}
                />
                <Switch
                    aria-label='New rectangle track mode'
                    size='small'
                    checked={objectType === ObjectType.TRACK}
                    checkedChildren='Track'
                    unCheckedChildren='Shape'
                    disabled={disabled}
                    onChange={(checked: boolean, event) => {
                        event.currentTarget.blur();
                        canvas.cancel();
                        dispatch(rememberObject({
                            activeObjectType: checked ? ObjectType.TRACK : ObjectType.SHAPE,
                        }, false));
                    }}
                />
                <Switch
                    aria-label='New annotation occluded'
                    className='cvat-rectangle-label-bar-occluded'
                    size='small'
                    checked={!!drawing.activeOccluded}
                    checkedChildren='Occluded'
                    unCheckedChildren='Not occluded'
                    disabled={disabled}
                    title='Place the next annotation as occluded (Q). Resets after each placement.'
                    onChange={(checked: boolean, event) => {
                        // Keep the engaged drawing tool; only the next placement's flag changes.
                        event.currentTarget.blur();
                        dispatch(setDrawingOccluded(checked));
                    }}
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
                            onClick={() => {
                                if (!active) {
                                    startDrawing(label);
                                    return;
                                }
                                // Clicking the selected class deselects it, as Esc does.
                                dispatch(setContinuedTrack(null));
                                canvas.cancel();
                            }}
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
