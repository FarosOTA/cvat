// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { Dispatch } from 'react';
import { AnyAction } from 'redux';
import { connect } from 'react-redux';
import Text from 'antd/lib/typography/Text';
import Radio, { RadioChangeEvent } from 'antd/lib/radio';
import Slider from 'antd/lib/slider';
import Checkbox, { CheckboxChangeEvent } from 'antd/lib/checkbox';
import Collapse from 'antd/lib/collapse';
import Button from 'antd/lib/button';
import Select from 'antd/lib/select';

import ColorPicker from 'components/annotation-page/standard-workspace/objects-side-bar/color-picker';
import { ColorizeIcon } from 'icons';
import { ColorBy, CombinedState, Workspace } from 'reducers';
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
    changeBorderMagnifier,
} from 'actions/settings-actions';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import GlobalHotKeys, { KeyMap } from 'utils/mousetrap-react';
import { ShortcutScope } from 'utils/enums';
import { subKeyMap } from 'utils/component-subkeymap';

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
    cursorMagnifier: boolean;
    cursorMagnifierHover: boolean;
    cursorMagnifierSize: number;
    cursorMagnifierScale: number;
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
        tool: 'editingCrosshair' | 'cursorMagnifier' | 'cursorMagnifierHover', enabled: boolean,
    ): void;
    onChangeBorderMagnifier(setting: 'cursorMagnifierSize' | 'cursorMagnifierScale', value: number): void;
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
                editingCrosshair, cursorMagnifier, cursorMagnifierHover, cursorMagnifierSize, cursorMagnifierScale,
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
        cursorMagnifier,
        cursorMagnifierHover,
        cursorMagnifierSize,
        cursorMagnifierScale,
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
        onChangeBorderMagnifier: (setting, value) => dispatch(changeBorderMagnifier(setting, value)),
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
        cursorMagnifierSize,
        cursorMagnifierScale,
        onSwitchRectanglePrecision,
        onChangeBorderMagnifier,
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
                        Appearance
                    </Text>
                ),
                key: 'appearance',
                children: (
                    <div className='cvat-objects-appearance-content cvat-appearance-block'>
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
                        {is2D && (
                            <>
                                <Checkbox
                                    className='cvat-appearance-magnifier-hover-checkbox'
                                    checked={cursorMagnifierHover}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        onSwitchRectanglePrecision('cursorMagnifierHover', event.target.checked);
                                    }}
                                >
                                    Magnified borders on hover
                                </Checkbox>
                                <Checkbox
                                    className='cvat-appearance-magnifier-editing-checkbox'
                                    checked={cursorMagnifier}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        onSwitchRectanglePrecision('cursorMagnifier', event.target.checked);
                                    }}
                                >
                                    Magnified borders while drawing/editing
                                </Checkbox>
                                <Checkbox
                                    className='cvat-appearance-editing-crosshair-checkbox'
                                    checked={editingCrosshair}
                                    onChange={(event: CheckboxChangeEvent) => {
                                        onSwitchRectanglePrecision('editingCrosshair', event.target.checked);
                                    }}
                                >
                                    Crosshairs while editing bounding boxes
                                </Checkbox>
                                <Text type='secondary'>Border magnifier size</Text>
                                <Select
                                    className='cvat-appearance-magnifier-size'
                                    aria-label='Border magnifier size'
                                    disabled={!cursorMagnifier && !cursorMagnifierHover}
                                    value={cursorMagnifierSize}
                                    onChange={(value: number) => onChangeBorderMagnifier('cursorMagnifierSize', value)}
                                >
                                    <Select.Option value={16}>Low (16 px)</Select.Option>
                                    <Select.Option value={32}>Medium (default, 32 px)</Select.Option>
                                    <Select.Option value={48}>High (48 px)</Select.Option>
                                </Select>
                                <Text type='secondary'>Border magnification</Text>
                                <Select
                                    className='cvat-appearance-magnifier-scale'
                                    aria-label='Border magnification'
                                    disabled={!cursorMagnifier && !cursorMagnifierHover}
                                    value={cursorMagnifierScale}
                                    onChange={(value: number) => onChangeBorderMagnifier('cursorMagnifierScale', value)}
                                >
                                    <Select.Option value={2}>Low (2×)</Select.Option>
                                    <Select.Option value={4}>Medium (default, 4×)</Select.Option>
                                    <Select.Option value={8}>High (8×)</Select.Option>
                                </Select>
                            </>
                        )}
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
