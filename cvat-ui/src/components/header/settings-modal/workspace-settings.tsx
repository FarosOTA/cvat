// Copyright (C) 2020-2022 Intel Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';

import { Row, Col } from 'antd/lib/grid';
import Checkbox, { CheckboxChangeEvent } from 'antd/lib/checkbox';
import InputNumber from 'antd/lib/input-number';
import Text from 'antd/lib/typography/Text';
import Slider from 'antd/lib/slider';
import Select from 'antd/lib/select';

import {
    MAX_ACCURACY,
} from 'components/annotation-page/standard-workspace/controls-side-bar/approximation-accuracy';
import { clamp } from 'utils/math';

interface Props {
    autoSave: boolean;
    autoSaveInterval: number;
    focusedObjectPadding: number;
    frameFitMargin: number;
    showAllInterpolationTracks: boolean;
    cursorMagnifier: boolean;
    cursorMagnifierHover: boolean;
    cursorMagnifierSize: number;
    cursorMagnifierScale: number;
    cursorMagnifierGap: number;
    adaptiveZoom: boolean;
    suppressRepeatDrawing: boolean;
    clearFocusOnCanvasLeave: boolean;
    resizeFromSides: boolean;
    hideRotationControl: boolean;
    flashAnnotations: boolean;
    intelligentPolygonCrop: boolean;
    defaultApproxPolyAccuracy: number;
    textFontSize: number;
    controlPointsSize: number;
    textPosition: 'center' | 'auto';
    textContent: string;
    showTagsOnFrame: boolean;
    onSwitchAutoSave(enabled: boolean): void;
    onChangeAutoSaveInterval(interval: number): void;
    onChangeFocusedObjectPadding(padding: number): void;
    onChangeFrameFitMargin(margin: number): void;
    onChangeDefaultApproxPolyAccuracy(approxPolyAccuracy: number): void;
    onSwitchShowingInterpolatedTracks(enabled: boolean): void;
    onChangeBorderMagnifier(
        setting: 'cursorMagnifierSize' | 'cursorMagnifierScale' | 'cursorMagnifierGap', value: number,
    ): void;
    onSwitchAdaptiveZoom(enabled: boolean): void;
    onSwitchFlashAnnotations(enabled: boolean): void;
    onSwitchSuppressRepeatDrawing(enabled: boolean): void;
    onSwitchRectanglePrecision(
        tool: 'clearFocusOnCanvasLeave' | 'resizeFromSides' | 'hideRotationControl', enabled: boolean,
    ): void;
    onSwitchIntelligentPolygonCrop(enabled: boolean): void;
    onChangeTextFontSize(fontSize: number): void;
    onChangeControlPointsSize(pointsSize: number): void;
    onChangeTextPosition(position: 'auto' | 'center'): void;
    onChangeTextContent(textContent: string[]): void;
    onSwitchShowingTagsOnFrame(enabled: boolean): void;
}

function WorkspaceSettingsComponent(props: Props): JSX.Element {
    const {
        autoSave,
        autoSaveInterval,
        focusedObjectPadding,
        frameFitMargin,
        showAllInterpolationTracks,
        cursorMagnifier,
        cursorMagnifierHover,
        cursorMagnifierSize,
        cursorMagnifierScale,
        cursorMagnifierGap,
        adaptiveZoom,
        suppressRepeatDrawing,
        clearFocusOnCanvasLeave,
        resizeFromSides,
        hideRotationControl,
        flashAnnotations,
        intelligentPolygonCrop,
        defaultApproxPolyAccuracy,
        textFontSize,
        controlPointsSize,
        textPosition,
        textContent,
        showTagsOnFrame,
        onSwitchAutoSave,
        onChangeAutoSaveInterval,
        onChangeFocusedObjectPadding,
        onChangeFrameFitMargin,
        onSwitchShowingInterpolatedTracks,
        onChangeBorderMagnifier,
        onSwitchAdaptiveZoom,
        onSwitchFlashAnnotations,
        onSwitchSuppressRepeatDrawing,
        onSwitchRectanglePrecision,
        onSwitchIntelligentPolygonCrop,
        onChangeDefaultApproxPolyAccuracy,
        onChangeTextFontSize,
        onChangeControlPointsSize,
        onChangeTextPosition,
        onChangeTextContent,
        onSwitchShowingTagsOnFrame,
    } = props;

    const minAutoSaveInterval = 1;
    const maxAutoSaveInterval = 60;
    const minFocusedObjectPadding = 0;
    const maxFocusedObjectPadding = 1000;
    const minControlPointsSize = 2;
    const maxControlPointsSize = 10;

    return (
        <div className='cvat-workspace-settings'>
            <Row className='cvat-player-setting'>
                <Col span={24}>
                    <Checkbox
                        className='cvat-workspace-settings-suppress-repeat-drawing'
                        checked={suppressRepeatDrawing}
                        onChange={(event: CheckboxChangeEvent): void => {
                            onSwitchSuppressRepeatDrawing(event.target.checked);
                        }}
                    >
                        Suppress repeat-drawing shortcut (N)
                    </Checkbox>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>
                        In Standard 2D, prevent Draw mode (N by default) from starting with the last label.
                        Choose a class explicitly by its code or drawing controls instead.
                        N still finishes active drawing or editing. Off by default.
                    </Text>
                </Col>
            </Row>
            <Row className='cvat-player-setting'>
                <Col span={24}>
                    <Checkbox
                        className='cvat-workspace-settings-clear-focus-on-canvas-leave'
                        checked={clearFocusOnCanvasLeave}
                        onChange={(event: CheckboxChangeEvent): void => {
                            onSwitchRectanglePrecision('clearFocusOnCanvasLeave', event.target.checked);
                        }}
                    >
                        Clear annotation focus when leaving the canvas
                    </Checkbox>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>
                        Remove the active annotation highlight when the pointer leaves the 2D canvas.
                        Off by default. Dragging and resizing are not interrupted.
                    </Text>
                </Col>
            </Row>
            <Row className='cvat-player-setting'>
                <Col span={24}>
                    <Checkbox
                        className='cvat-workspace-settings-resize-from-sides'
                        checked={resizeFromSides}
                        onChange={(event: CheckboxChangeEvent): void => {
                            onSwitchRectanglePrecision('resizeFromSides', event.target.checked);
                        }}
                    >
                        Resize bounding boxes from sides
                    </Checkbox>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>
                        Drag within 6 screen pixels inside or outside an active box edge to resize that side.
                        A directional resize cursor marks the grab area, independently of outline thickness or zoom.
                        Disabled by default. When enabled, only corner handles are shown.
                        Dragging the box body is unchanged.
                    </Text>
                </Col>
            </Row>
            <Row className='cvat-player-setting'>
                <Col span={24}>
                    <Checkbox
                        className='cvat-workspace-settings-hide-rotation-control'
                        checked={hideRotationControl}
                        onChange={(event: CheckboxChangeEvent): void => {
                            onSwitchRectanglePrecision('hideRotationControl', event.target.checked);
                        }}
                    >
                        Hide rotation control point
                    </Checkbox>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>
                        Hide the rotation handle on 2D annotations. Resize handles and existing angles are unchanged.
                        Off by default.
                    </Text>
                </Col>
            </Row>
            <Row className='cvat-player-setting'>
                <Col span={24}>
                    <Text type='secondary'>Border magnifier size</Text>
                    <Select
                        className='cvat-workspace-settings-magnifier-size'
                        aria-label='Border magnifier size'
                        disabled={!cursorMagnifier && !cursorMagnifierHover}
                        value={cursorMagnifierSize}
                        onChange={(value: number) => onChangeBorderMagnifier('cursorMagnifierSize', value)}
                    >
                        <Select.Option value={16}>Low (16 px)</Select.Option>
                        <Select.Option value={32}>Medium (default, 32 px)</Select.Option>
                        <Select.Option value={48}>High (48 px)</Select.Option>
                    </Select>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>Border magnification</Text>
                    <Select
                        className='cvat-workspace-settings-magnifier-scale'
                        aria-label='Border magnification'
                        disabled={!cursorMagnifier && !cursorMagnifierHover}
                        value={cursorMagnifierScale}
                        onChange={(value: number) => onChangeBorderMagnifier('cursorMagnifierScale', value)}
                    >
                        <Select.Option value={2}>Low (2×)</Select.Option>
                        <Select.Option value={4}>Medium (default, 4×)</Select.Option>
                        <Select.Option value={8}>High (8×)</Select.Option>
                    </Select>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>Border magnifier gap </Text>
                    <InputNumber
                        className='cvat-workspace-settings-magnifier-gap'
                        aria-label='Border magnifier gap'
                        min={0}
                        max={200}
                        step={1}
                        precision={0}
                        disabled={!cursorMagnifier && !cursorMagnifierHover}
                        value={cursorMagnifierGap}
                        onChange={(value: number | null): void => {
                            if (typeof value === 'number') {
                                onChangeBorderMagnifier('cursorMagnifierGap', Math.floor(clamp(value, 0, 200)));
                            }
                        }}
                    />
                    <Text type='secondary'> screen pixels (default: 36)</Text>
                </Col>
            </Row>
            <Row className='cvat-player-setting'>
                <Col span={24}>
                    <Checkbox
                        className='cvat-text-color cvat-workspace-settings-flash-annotations'
                        checked={flashAnnotations}
                        onChange={(event: CheckboxChangeEvent): void => {
                            onSwitchFlashAnnotations(event.target.checked);
                        }}
                    >
                        Flash annotations
                    </Checkbox>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>
                        Subtly highlight newly appearing small boxes in 2D, only at a track&apos;s start
                        and only without a similar box in the previous frame.
                        Enabled by default; respects reduced motion.
                    </Text>
                </Col>
            </Row>
            <Row className='cvat-workspace-settings-frame-fit-margin cvat-player-setting'>
                <Col span={24}>
                    <Text className='cvat-text-color'>Frame fit margin </Text>
                    <InputNumber
                        aria-label='Frame fit margin'
                        min={0}
                        max={100}
                        step={1}
                        precision={0}
                        value={frameFitMargin}
                        onChange={(value: number | null): void => {
                            if (typeof value === 'number') {
                                onChangeFrameFitMargin(Math.floor(clamp(value, 0, 100)));
                            }
                        }}
                    />
                    <Text type='secondary'> screen pixels</Text>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>
                        Space around the fitted 2D frame (default: 8). Changing this refits the frame.
                        Use 0 for no margin.
                    </Text>
                </Col>
            </Row>
            <Row className='cvat-player-setting'>
                <Col span={24}>
                    <Checkbox
                        className='cvat-text-color cvat-workspace-settings-auto-save'
                        checked={autoSave}
                        onChange={(event: CheckboxChangeEvent): void => {
                            onSwitchAutoSave(event.target.checked);
                        }}
                    >
                        Enable auto save
                    </Checkbox>
                </Col>
                <Col className='cvat-workspace-settings-auto-save-interval'>
                    <Text type='secondary'> Auto save every </Text>
                    <InputNumber
                        size='small'
                        min={minAutoSaveInterval}
                        max={maxAutoSaveInterval}
                        step={1}
                        value={Math.round(autoSaveInterval / (60 * 1000))}
                        onChange={(value: number | undefined | string): void => {
                            if (typeof value !== 'undefined') {
                                onChangeAutoSaveInterval(
                                    Math.floor(clamp(+value, minAutoSaveInterval, maxAutoSaveInterval)) * 60 * 1000,
                                );
                            }
                        }}
                    />
                    <Text type='secondary'> minutes </Text>
                </Col>
            </Row>
            <Row className='cvat-player-setting'>
                <Col span={12} className='cvat-workspace-settings-show-interpolated'>
                    <Row>
                        <Checkbox
                            className='cvat-text-color'
                            checked={showAllInterpolationTracks}
                            onChange={(event: CheckboxChangeEvent): void => {
                                onSwitchShowingInterpolatedTracks(event.target.checked);
                            }}
                        >
                            Show all interpolation tracks
                        </Checkbox>
                    </Row>
                    <Row>
                        <Text type='secondary'> Show hidden interpolated objects in the side panel</Text>
                    </Row>
                </Col>
            </Row>
            <Row className='cvat-workspace-settings-text-settings cvat-player-setting'>
                <Col span={24}>
                    <Text>Content of a text</Text>
                </Col>
                <Col span={16}>
                    <Select
                        className='cvat-workspace-settings-text-content'
                        mode='multiple'
                        value={textContent.split(',').filter((entry: string) => !!entry)}
                        onChange={onChangeTextContent}
                    >
                        <Select.Option value='id'>ID</Select.Option>
                        <Select.Option value='label'>Label</Select.Option>
                        <Select.Option value='attributes'>Attributes</Select.Option>
                        <Select.Option value='source'>Source</Select.Option>
                        <Select.Option value='descriptions'>Descriptions</Select.Option>
                        <Select.Option value='dimensions'>Dimensions</Select.Option>
                        <Select.Option value='layer'>Layer</Select.Option>
                    </Select>
                </Col>
            </Row>
            <Row className='cvat-workspace-settings-text-settings cvat-player-setting'>
                <Col span={12}>
                    <Text>Position of a text</Text>
                </Col>
                <Col span={12}>
                    <Text>Font size of a text</Text>
                </Col>
                <Col span={12}>
                    <Select
                        className='cvat-workspace-settings-text-position'
                        value={textPosition}
                        onChange={onChangeTextPosition}
                    >
                        <Select.Option value='auto'>Auto</Select.Option>
                        <Select.Option value='center'>Center</Select.Option>
                    </Select>
                </Col>
                <Col span={12}>
                    <InputNumber
                        className='cvat-workspace-settings-text-size'
                        onChange={onChangeTextFontSize}
                        min={8}
                        max={20}
                        value={textFontSize}
                    />
                </Col>
            </Row>
            <Row className='cvat-workspace-settings-adaptive-zoom cvat-player-setting'>
                <Col span={24}>
                    <Checkbox
                        className='cvat-text-color'
                        checked={adaptiveZoom}
                        onChange={(event: CheckboxChangeEvent): void => {
                            onSwitchAdaptiveZoom(event.target.checked);
                        }}
                    >
                        Adaptive zoom algorithm
                    </Checkbox>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>
                        Enable smoother version of zooming, compatible with a trackpad and pinch gestures
                    </Text>
                </Col>
            </Row>
            <Row className='cvat-workspace-settings-intelligent-polygon-cropping cvat-player-setting'>
                <Col span={24}>
                    <Checkbox
                        className='cvat-text-color'
                        checked={intelligentPolygonCrop}
                        onChange={(event: CheckboxChangeEvent): void => {
                            onSwitchIntelligentPolygonCrop(event.target.checked);
                        }}
                    >
                        Intelligent polygon cropping
                    </Checkbox>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>Try to crop polygons automatically when editing</Text>
                </Col>
            </Row>
            <Row className='cvat-workspace-settings-show-frame-tags cvat-player-setting'>
                <Col span={24}>
                    <Checkbox
                        className='cvat-text-color'
                        checked={showTagsOnFrame}
                        onChange={(event: CheckboxChangeEvent): void => {
                            onSwitchShowingTagsOnFrame(event.target.checked);
                        }}
                    >
                        Show tags on frame
                    </Checkbox>
                </Col>
                <Col span={24}>
                    <Text type='secondary'>Show frame tags in the corner of the workspace</Text>
                </Col>
            </Row>
            <Row className='cvat-workspace-settings-focused-object-padding cvat-player-setting'>
                <Col>
                    <Text className='cvat-text-color'> Focused object padding </Text>
                    <InputNumber
                        min={minFocusedObjectPadding}
                        max={maxFocusedObjectPadding}
                        value={focusedObjectPadding}
                        onChange={(value: number | null): void => {
                            if (typeof value === 'number') {
                                onChangeFocusedObjectPadding(
                                    Math.floor(clamp(+value, minFocusedObjectPadding, maxFocusedObjectPadding)),
                                );
                            }
                        }}
                    />
                </Col>
                <Col span={24}>
                    <Text type='secondary'>Adds extra space in pixels around an object when it gets fitted</Text>
                </Col>
            </Row>
            <Row className='cvat-workspace-settings-control-points-size cvat-player-setting'>
                <Col>
                    <Text className='cvat-text-color'> Control points size </Text>
                    <InputNumber
                        min={minControlPointsSize}
                        max={maxControlPointsSize}
                        value={controlPointsSize}
                        onChange={(value: number | undefined | string): void => {
                            if (typeof value !== 'undefined') {
                                onChangeControlPointsSize(
                                    Math.floor(clamp(+value, minControlPointsSize, maxControlPointsSize)),
                                );
                            }
                        }}
                    />
                </Col>
            </Row>
            <Row className='cvat-workspace-settings-approx-poly-threshold cvat-player-setting'>
                <Col>
                    <Text className='cvat-text-color'>Default polygon simplification threshold</Text>
                </Col>
                <Col span={7} offset={1}>
                    <Slider
                        min={0}
                        max={MAX_ACCURACY}
                        step={1}
                        value={defaultApproxPolyAccuracy}
                        dots
                        onChange={onChangeDefaultApproxPolyAccuracy}
                    />
                </Col>
                <Col>
                    <Text type='secondary'>
                        Higher values preserve more polygon detail. Used for serverless interactors,
                        OpenCV scissors, and polygon simplification
                    </Text>
                </Col>
            </Row>
        </div>
    );
}

export default React.memo(WorkspaceSettingsComponent);
