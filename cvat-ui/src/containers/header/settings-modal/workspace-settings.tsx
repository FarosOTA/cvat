// Copyright (C) 2020-2022 Intel Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { connect } from 'react-redux';

import {
    switchAutoSave,
    changeAutoSaveInterval,
    changeFocusedObjectPadding,
    changeFrameFitMargin,
    switchShowingInterpolatedTracks,
    switchShowingObjectsTextAlways,
    switchIntelligentPolygonCrop,
    changeDefaultApproxPolyAccuracy,
    switchTextFontSize,
    switchControlPointsSize,
    switchTextPosition,
    switchTextContent,
    switchShowingTagsOnFrame,
    switchAdaptiveZoom,
    switchRectanglePrecision,
    changeBorderMagnifier,
} from 'actions/settings-actions';

import { CombinedState } from 'reducers';

import WorkspaceSettingsComponent from 'components/header/settings-modal/workspace-settings';

interface StateToProps {
    autoSave: boolean;
    autoSaveInterval: number;
    focusedObjectPadding: number;
    frameFitMargin: number;
    showAllInterpolationTracks: boolean;
    showObjectsTextAlways: boolean;
    defaultApproxPolyAccuracy: number;
    adaptiveZoom: boolean;
    editingCrosshair: boolean;
    cursorMagnifier: boolean;
    cursorMagnifierSize: number;
    cursorMagnifierScale: number;
    intelligentPolygonCrop: boolean;
    textFontSize: number;
    controlPointsSize: number;
    textPosition: 'auto' | 'center';
    textContent: string;
    showTagsOnFrame: boolean;
}

interface DispatchToProps {
    onSwitchAutoSave(enabled: boolean): void;
    onChangeAutoSaveInterval(interval: number): void;
    onChangeFocusedObjectPadding(margin: number): void;
    onChangeFrameFitMargin(margin: number): void;
    onSwitchShowingInterpolatedTracks(enabled: boolean): void;
    onSwitchShowingObjectsTextAlways(enabled: boolean): void;
    onSwitchAdaptiveZoom(enabled: boolean): void;
    onSwitchRectanglePrecision(tool: 'editingCrosshair' | 'cursorMagnifier', enabled: boolean): void;
    onChangeBorderMagnifier(setting: 'cursorMagnifierSize' | 'cursorMagnifierScale', value: number): void;
    onSwitchIntelligentPolygonCrop(enabled: boolean): void;
    onChangeDefaultApproxPolyAccuracy(approxPolyAccuracy: number): void;
    onChangeTextFontSize(fontSize: number): void;
    onChangeControlPointsSize(pointsSize: number): void;
    onChangeTextPosition(position: 'auto' | 'center'): void;
    onChangeTextContent(textContent: string[]): void;
    onSwitchShowingTagsOnFrame(enabled: boolean): void;
}

function mapStateToProps(state: CombinedState): StateToProps {
    const { workspace } = state.settings;
    const {
        autoSave,
        autoSaveInterval,
        focusedObjectPadding,
        frameFitMargin,
        showAllInterpolationTracks,
        showObjectsTextAlways,
        adaptiveZoom,
        editingCrosshair,
        cursorMagnifier,
        cursorMagnifierSize,
        cursorMagnifierScale,
        intelligentPolygonCrop,
        defaultApproxPolyAccuracy,
        textFontSize,
        controlPointsSize,
        textPosition,
        textContent,
        showTagsOnFrame,
    } = workspace;

    return {
        autoSave,
        autoSaveInterval,
        focusedObjectPadding,
        frameFitMargin,
        showAllInterpolationTracks,
        showObjectsTextAlways,
        adaptiveZoom,
        editingCrosshair,
        cursorMagnifier,
        cursorMagnifierSize,
        cursorMagnifierScale,
        intelligentPolygonCrop,
        defaultApproxPolyAccuracy,
        textFontSize,
        controlPointsSize,
        textPosition,
        textContent,
        showTagsOnFrame,
    };
}

const mapDispatchToProps: DispatchToProps = {
    onSwitchAutoSave: switchAutoSave,
    onChangeAutoSaveInterval: changeAutoSaveInterval,
    onChangeFocusedObjectPadding: changeFocusedObjectPadding,
    onChangeFrameFitMargin: changeFrameFitMargin,
    onSwitchShowingInterpolatedTracks: switchShowingInterpolatedTracks,
    onSwitchShowingObjectsTextAlways: switchShowingObjectsTextAlways,
    onSwitchAdaptiveZoom: switchAdaptiveZoom,
    onSwitchRectanglePrecision: switchRectanglePrecision,
    onChangeBorderMagnifier: changeBorderMagnifier,
    onSwitchIntelligentPolygonCrop: switchIntelligentPolygonCrop,
    onChangeDefaultApproxPolyAccuracy: changeDefaultApproxPolyAccuracy,
    onChangeTextFontSize: switchTextFontSize,
    onChangeControlPointsSize: switchControlPointsSize,
    onChangeTextPosition: switchTextPosition,
    onChangeTextContent: switchTextContent,
    onSwitchShowingTagsOnFrame: switchShowingTagsOnFrame,
};

function WorkspaceSettingsContainer(props: StateToProps & DispatchToProps): JSX.Element {
    return <WorkspaceSettingsComponent {...props} />;
}

export default connect(mapStateToProps, mapDispatchToProps)(WorkspaceSettingsContainer);
