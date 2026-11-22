// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { Dispatch } from 'react';
import { AnyAction } from 'redux';
import { connect, useDispatch, useSelector } from 'react-redux';
import Text from 'antd/lib/typography/Text';
import Radio, { RadioChangeEvent } from 'antd/lib/radio';
import Slider from 'antd/lib/slider';
import Checkbox, { CheckboxChangeEvent } from 'antd/lib/checkbox';
import Collapse from 'antd/lib/collapse';
import Button from 'antd/lib/button';
import Select from 'antd/lib/select';
import InputNumber from 'antd/lib/input-number';

import ColorPicker from 'components/annotation-page/standard-workspace/objects-side-bar/color-picker';
import { ColorizeIcon } from 'icons';
import {
    ColorBy, CombinedState, FrameSpeed, Workspace,
} from 'reducers';
import { DimensionType, Job } from 'cvat-core-wrapper';
import { OrientationVisibility } from 'cvat-canvas3d-wrapper';
import { collapseAppearance as collapseAppearanceAction } from 'actions/annotation-actions';
import {
    changeShapesColorBy as changeShapesColorByAction,
    changeShapesOpacity as changeShapesOpacityAction,
    changeSelectedShapesOpacity as changeSelectedShapesOpacityAction,
    changeShapesOutlinedBorders as changeShapesOutlinedBordersAction,
    changeShowBitmap as changeShowBitmapAction,
    changeShowProjections as changeShowProjectionsAction,
    changeOrientationVisibility as changeOrientationVisibilityAction,
    switchRectanglePrecision,
    switchNextFrameAfterPlacing,
    changeRepeatBrushSize,
    changeFrameStep,
    changeFrameSpeed,
    switchResetZoom,
    switchSmoothImage,
    switchShowingDeletedFrames,
    switchShowingObjectsTextAlways,
} from 'actions/settings-actions';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import GlobalHotKeys, { KeyMap } from 'utils/mousetrap-react';
import { ShortcutScope } from 'utils/enums';
import { subKeyMap } from 'utils/component-subkeymap';
import { clamp } from 'utils/math';

const componentShortcuts = {
    SWITCH_COLOR_BY_APPEARANCE: {
        name: 'Switch objects appearance setting "Color by"',
        description: 'Objects color mode may be by object, label, or group',
        sequences: [],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
    TOGGLE_SHOW_BITMAP_APPEARANCE: {
        name: 'Switch objects appearance setting "Show bitmap"',
        description: 'Show or hide the bitmap layer on the canvas',
        sequences: [],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
};

registerComponentShortcuts(componentShortcuts);

interface StateToProps {
    appearanceCollapsed: boolean;
    colorBy: ColorBy;
    opacity: number;
    selectedOpacity: number;
    outlined: boolean;
    outlineColor: string;
    editingCrosshair: boolean;
    showCrosshairCursor: boolean;
    cursorMagnifier: boolean;
    cursorMagnifierHover: boolean;
    nextFrameAfterPlacing: boolean;
    showBitmap: boolean;
    showProjections: boolean;
    orientationVisibility: OrientationVisibility;
    workspace: Workspace;
    jobInstance: Job;
    keyMap: KeyMap;
}

interface DispatchToProps {
    collapseAppearance(): void;
    changeShapesColorBy(colorBy: ColorBy): void;
    changeShapesOpacity(value: number): void;
    changeSelectedShapesOpacity(value: number): void;
    changeShapesOutlinedBorders(outlined: boolean, color: string): void;
    changeShowBitmap(showBitmap: boolean): void;
    changeShowProjections(event: CheckboxChangeEvent): void;
    changeOrientationVisibility(orientationVisibility: Partial<OrientationVisibility>): void;
    onSwitchRectanglePrecision(
        tool: 'editingCrosshair' | 'showCrosshairCursor' | 'cursorMagnifier' | 'cursorMagnifierHover' | 'clickToGrab' |
        'cornerHandles' | 'drawingDimensions' | 'autoAdvanceOnModify', enabled: boolean,
    ): void;
    onSwitchNextFrameAfterPlacing(enabled: boolean): void;
}

function mapStateToProps(state: CombinedState): StateToProps {
    const {
        annotation: {
            appearanceCollapsed,
            workspace,
            job: { instance: jobInstance },
        },
        settings: {
            shapes: {
                colorBy, opacity, selectedOpacity, outlined, outlineColor, showBitmap, showProjections,
                orientationVisibility,
            },
            workspace: {
                editingCrosshair, showCrosshairCursor, cursorMagnifier, cursorMagnifierHover,
                nextFrameAfterPlacing,
            },
        },
        shortcuts: { keyMap },
    } = state;

    return {
        appearanceCollapsed,
        colorBy,
        opacity,
        selectedOpacity,
        outlined,
        outlineColor,
        editingCrosshair,
        showCrosshairCursor,
        cursorMagnifier,
        cursorMagnifierHover,
        nextFrameAfterPlacing,
        showBitmap,
        showProjections,
        workspace,
        orientationVisibility,
        jobInstance: jobInstance as Job,
        keyMap,
    };
}

function mapDispatchToProps(dispatch: Dispatch<AnyAction>): DispatchToProps {
    return {
        onSwitchRectanglePrecision: (tool, enabled) => dispatch(switchRectanglePrecision(tool, enabled)),
        onSwitchNextFrameAfterPlacing: (enabled) => dispatch(switchNextFrameAfterPlacing(enabled)),
        collapseAppearance(): void {
            dispatch(collapseAppearanceAction());
        },
        changeShapesColorBy(colorBy: ColorBy): void {
            dispatch(changeShapesColorByAction(colorBy));
        },
        changeShapesOpacity(value: number): void {
            dispatch(changeShapesOpacityAction(value));
        },
        changeSelectedShapesOpacity(value: number): void {
            dispatch(changeSelectedShapesOpacityAction(value));
        },
        changeShapesOutlinedBorders(outlined: boolean, color: string): void {
            dispatch(changeShapesOutlinedBordersAction(outlined, color));
        },
        changeShowBitmap(showBitmap: boolean): void {
            dispatch(changeShowBitmapAction(showBitmap));
        },
        changeShowProjections(event: CheckboxChangeEvent): void {
            dispatch(changeShowProjectionsAction(event.target.checked));
        },
        changeOrientationVisibility(orientationVisibility: Partial<OrientationVisibility>): void {
            dispatch(changeOrientationVisibilityAction(orientationVisibility));
        },
    };
}

type Props = StateToProps & DispatchToProps;

function AppearanceBlock(props: Props): JSX.Element {
    const {
        appearanceCollapsed,
        colorBy,
        opacity,
        selectedOpacity,
        outlined,
        outlineColor,
        editingCrosshair,
        cursorMagnifier,
        cursorMagnifierHover,
        onSwitchRectanglePrecision,
        showCrosshairCursor,
        nextFrameAfterPlacing,
        onSwitchNextFrameAfterPlacing,
        workspace,
        showBitmap,
        showProjections,
        orientationVisibility,
        collapseAppearance,
        changeShapesColorBy,
        changeShapesOpacity,
        changeSelectedShapesOpacity,
        changeShapesOutlinedBorders,
        changeShowBitmap,
        changeShowProjections,
        changeOrientationVisibility,
        jobInstance,
        keyMap,
    } = props;

    const dispatch = useDispatch();
    const {
        frameStep, frameSpeed, resetZoom, smoothImage, showDeletedFrames,
    } = useSelector(
        (state: CombinedState) => state.settings.player,
    );
    const {
        clickToGrab, showObjectsTextAlways, cornerHandles, drawingDimensions, autoAdvanceOnModify, repeatBrushSize,
    } = useSelector((state: CombinedState) => state.settings.workspace);

    const is2D = jobInstance.dimension === DimensionType.DIMENSION_2D;
    const is3D = jobInstance.dimension === DimensionType.DIMENSION_3D;
    const nextColorBy = {
        [ColorBy.LABEL]: ColorBy.INSTANCE,
        [ColorBy.INSTANCE]: ColorBy.GROUP,
        [ColorBy.GROUP]: ColorBy.LABEL,
    };

    const handlers: Record<keyof typeof componentShortcuts, (event?: KeyboardEvent) => void> = {
        SWITCH_COLOR_BY_APPEARANCE: (event: KeyboardEvent | undefined) => {
            event?.preventDefault();
            changeShapesColorBy(nextColorBy[colorBy]);
        },
        TOGGLE_SHOW_BITMAP_APPEARANCE: (event: KeyboardEvent | undefined) => {
            if (is2D) {
                event?.preventDefault();
                changeShowBitmap(!showBitmap);
            }
        },
    };

    return (
        <Collapse
            onChange={collapseAppearance}
            activeKey={appearanceCollapsed ? [] : ['appearance']}
            className='cvat-objects-appearance-collapse'
            items={[{
                label: (
                    <Text strong className='cvat-objects-appearance-collapse-header'>
                        Settings
                    </Text>
                ),
                key: 'appearance',
                children: (
                    <div className='cvat-objects-appearance-content cvat-appearance-block cvat-annotation-settings-block'>
                        <GlobalHotKeys keyMap={subKeyMap(componentShortcuts, keyMap)} handlers={handlers} />
                        <Text type='secondary'>Color by</Text>
                        <Radio.Group
                            className='cvat-appearance-color-by-radio-group'
                            value={colorBy}
                            onChange={(event: RadioChangeEvent) => changeShapesColorBy(event.target.value)}
                        >
                            {Object.keys(nextColorBy).map((val) => (
                                <Radio.Button value={val} key={val}>{val}</Radio.Button>
                            ))}
                        </Radio.Group>
                        <Text type='secondary'>Opacity</Text>
                        <Slider
                            className='cvat-appearance-opacity-slider'
                            onChange={changeShapesOpacity}
                            value={opacity}
                            min={0}
                            max={100}
                        />
                        <Text type='secondary'>Selected opacity</Text>
                        <Slider
                            className='cvat-appearance-selected-opacity-slider'
                            onChange={changeSelectedShapesOpacity}
                            value={selectedOpacity}
                            min={0}
                            max={100}
                        />
                        <Checkbox
                            className='cvat-appearance-outlinded-borders-checkbox'
                            onChange={(event: CheckboxChangeEvent) => {
                                changeShapesOutlinedBorders(event.target.checked, outlineColor);
                            }}
                            checked={outlined}
                        >
                            Outlined borders
                            <ColorPicker
                                onChange={(color) => changeShapesOutlinedBorders(outlined, color)}
                                value={outlineColor}
                                placement='top'
                                resetVisible={false}
                            >
                                <Button className='cvat-appearance-outlined-borders-button' type='link' shape='circle'>
                                    <ColorizeIcon />
                                </Button>
                            </ColorPicker>
                        </Checkbox>
                        {is2D && workspace === Workspace.STANDARD && (
                            <>
                                <Text type='secondary'>Repeat brush diameter (px): {repeatBrushSize}</Text>
                                <Slider
                                    className='cvat-repeat-brush-size'
                                    {...{ ariaLabelForHandle: 'Repeat brush diameter (px)' }}
                                    min={1}
                                    max={500}
                                    step={1}
                                    value={repeatBrushSize}
                                    tooltip={{ formatter: (value) => `${value} px` }}
                                    onChange={(value: number) => dispatch(changeRepeatBrushSize(value))}
                                />
                            </>
                        )}
                        {is2D && workspace === Workspace.STANDARD && (
                            <Checkbox
                                className='cvat-appearance-next-frame-after-placing-checkbox'
                                checked={nextFrameAfterPlacing}
                                onChange={(event: CheckboxChangeEvent) => {
                                    onSwitchNextFrameAfterPlacing(event.target.checked);
                                }}
                            >
                                Auto advance
                            </Checkbox>
                        )}
                        {is2D && workspace === Workspace.STANDARD && (
                            <Checkbox
                                className='cvat-appearance-auto-advance-on-modify-checkbox'
                                title='Move to the next frame after moving, resizing, or editing an existing annotation'
                                checked={autoAdvanceOnModify}
                                onChange={(event: CheckboxChangeEvent) => {
                                    onSwitchRectanglePrecision('autoAdvanceOnModify', event.target.checked);
                                }}
                            >
                                Auto advance on modification
                            </Checkbox>
                        )}
                        {is2D && (
                            <>
                                <Checkbox
                                    className='cvat-appearance-magnifier-hover-checkbox'
                                    checked={cursorMagnifierHover}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        onSwitchRectanglePrecision('cursorMagnifierHover', event.target.checked);
                                    }}
                                >
                                    Magnify box borders on hover
                                </Checkbox>
                                <Checkbox
                                    className='cvat-appearance-magnifier-editing-checkbox'
                                    checked={cursorMagnifier}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        onSwitchRectanglePrecision('cursorMagnifier', event.target.checked);
                                    }}
                                >
                                    Magnify box borders while drawing or editing
                                </Checkbox>
                                <Checkbox
                                    className='cvat-appearance-editing-crosshair-checkbox'
                                    checked={editingCrosshair}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        onSwitchRectanglePrecision('editingCrosshair', event.target.checked);
                                    }}
                                >
                                    Show box-edge guides while editing
                                </Checkbox>
                                <Checkbox
                                    className='cvat-appearance-crosshair-cursor-checkbox'
                                    title='Keep the mouse pointer visible while drawing or editing boxes with crosshairs'
                                    checked={showCrosshairCursor}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        onSwitchRectanglePrecision('showCrosshairCursor', event.target.checked);
                                    }}
                                >
                                    Show mouse pointer with crosshairs
                                </Checkbox>
                                <Checkbox
                                    className='cvat-workspace-settings-click-to-grab'
                                    title='Click to pick up a box or resize handle, then click again to place it.'
                                    checked={clickToGrab}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        onSwitchRectanglePrecision('clickToGrab', event.target.checked);
                                    }}
                                >
                                    Click to grab bounding boxes
                                </Checkbox>
                                <Checkbox
                                    className='cvat-appearance-corner-handles-checkbox'
                                    title='Show resize handles at the corners of the active bounding box'
                                    checked={cornerHandles}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        onSwitchRectanglePrecision('cornerHandles', event.target.checked);
                                    }}
                                >
                                    Show corner control points
                                </Checkbox>
                                <Checkbox
                                    className='cvat-appearance-drawing-dimensions-checkbox'
                                    title='Show the width and height of a box or ellipse while it is being drawn'
                                    checked={drawingDimensions}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        onSwitchRectanglePrecision('drawingDimensions', event.target.checked);
                                    }}
                                >
                                    Show dimensions while drawing
                                </Checkbox>
                            </>
                        )}
                        <Text type='secondary'>Player step</Text>
                        <InputNumber
                            className='cvat-player-settings-step'
                            aria-label='Player step'
                            title='Number of frames skipped by the backward and forward jump controls'
                            min={2}
                            max={1000}
                            value={frameStep}
                            onChange={(value: number | null) => {
                                if (value !== null) dispatch(changeFrameStep(Math.floor(clamp(value, 2, 1000))));
                            }}
                        />
                        <Text type='secondary'>Player speed</Text>
                        <Select
                            className='cvat-player-settings-speed-select'
                            aria-label='Player speed'
                            value={frameSpeed}
                            onChange={(value: FrameSpeed) => dispatch(changeFrameSpeed(value))}
                            options={[
                                { value: FrameSpeed.Fastest, label: 'Fastest' },
                                { value: FrameSpeed.Fast, label: 'Fast' },
                                { value: FrameSpeed.Usual, label: 'Usual' },
                                { value: FrameSpeed.Slow, label: 'Slow' },
                                { value: FrameSpeed.Slower, label: 'Slower' },
                                { value: FrameSpeed.Slowest, label: 'Slowest' },
                            ]}
                        />
                        <Checkbox
                            className='cvat-player-settings-reset-zoom-checkbox'
                            title='Fit the image after changing frames'
                            checked={resetZoom}
                            onChange={(event) => dispatch(switchResetZoom(event.target.checked))}
                        >
                            Reset zoom
                        </Checkbox>
                        <Checkbox
                            className='cvat-player-settings-smooth-image-checkbox'
                            title='Smooth image pixels when zoomed in'
                            checked={smoothImage}
                            onChange={(event) => dispatch(switchSmoothImage(event.target.checked))}
                        >
                            Smooth image
                        </Checkbox>
                        <Checkbox
                            className='cvat-workspace-settings-show-deleted'
                            title='Allow navigation to deleted frames so they can be restored'
                            checked={showDeletedFrames}
                            onChange={(event) => dispatch(switchShowingDeletedFrames(event.target.checked))}
                        >
                            Show deleted frames
                        </Checkbox>
                        <Checkbox
                            className='cvat-workspace-settings-show-text-always'
                            title='Show object details on the canvas even when the object is inactive'
                            checked={showObjectsTextAlways}
                            onChange={(event) => dispatch(switchShowingObjectsTextAlways(event.target.checked))}
                        >
                            Always show object details
                        </Checkbox>
                        {is3D && (
                            <div className='cvat-appearance-cuboid-orientation-checkboxes'>
                                <Checkbox
                                    checked={orientationVisibility.x}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        changeOrientationVisibility({
                                            x: event.target.checked,
                                            y: event.target.checked,
                                            z: event.target.checked,
                                        });
                                    }}
                                >
                                    Cuboid orientation
                                </Checkbox>
                            </div>
                        )}
                        {is2D && (
                            <Checkbox
                                className='cvat-appearance-bitmap-checkbox'
                                onChange={(event: CheckboxChangeEvent) => {
                                    changeShowBitmap(event.target.checked);
                                }}
                                checked={showBitmap}
                            >
                                Show bitmap
                            </Checkbox>
                        )}
                        {is2D && (
                            <Checkbox
                                className='cvat-appearance-cuboid-projections-checkbox'
                                onChange={changeShowProjections}
                                checked={showProjections}
                            >
                                Show projections
                            </Checkbox>
                        )}
                    </div>
                ),
            }]}
        />
    );
}

export default connect(mapStateToProps, mapDispatchToProps)(React.memo(AppearanceBlock));
