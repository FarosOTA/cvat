// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import Icon from '@ant-design/icons';

import { CursorIcon } from 'icons';
import { ActiveControl, CombinedState } from 'reducers';
import { Canvas } from 'cvat-canvas-wrapper';
import { Canvas3d } from 'cvat-canvas3d-wrapper';
import { ObjectType, ShapeType } from 'cvat-core-wrapper';
import CVATTooltip from 'components/common/cvat-tooltip';
import GlobalHotKeys from 'utils/mousetrap-react';
import { ShortcutScope } from 'utils/enums';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import { rememberObject, setContinuedTrack } from 'actions/annotation-actions';
import { subKeyMap } from 'utils/component-subkeymap';
import { useDispatch, useSelector } from 'react-redux';

export interface Props {
    canvasInstance: Canvas | Canvas3d;
    cursorShortkey: string;
    activeControl: ActiveControl;
}

const componentShortcuts = {
    CANCEL: {
        name: 'Cancel',
        description: 'Cancel any active canvas mode',
        sequences: ['esc'],
        scope: ShortcutScope.STANDARD_WORKSPACE_CONTROLS,
    },
    SWITCH_DRAW_OBJECT_TYPE: {
        name: 'Switch shape / track',
        description: 'Switch between shape and track for manual drawing without discarding drawn points',
        sequences: ['alt+t'],
        scope: ShortcutScope.STANDARD_WORKSPACE_CONTROLS,
    },
};

registerComponentShortcuts(componentShortcuts);

function CursorControl(props: Props): JSX.Element {
    const {
        canvasInstance, activeControl, cursorShortkey,
    } = props;

    const { keyMap } = useSelector((state: CombinedState) => state.shortcuts);
    const { drawing, player, canvas } = useSelector((state: CombinedState) => state.annotation);
    const dispatch = useDispatch();

    const handler = (): void => {
        // Canceling explicitly ends "Next frame after placing" track continuation.
        dispatch(setContinuedTrack(null));
        // Also cancel pending tool initialization while the canvas is still idle.
        canvasInstance.cancel();
    };

    const handlers: Record<keyof typeof componentShortcuts, (event?: KeyboardEvent) => void> = {
        CANCEL: (event: KeyboardEvent | undefined) => {
            if (event) event.preventDefault();
            handler();
        },
        SWITCH_DRAW_OBJECT_TYPE: (event: KeyboardEvent | undefined) => {
            if (event?.repeat || !canvas.ready || player.frame.fetching || player.frame.data.deleted ||
                drawing.activeObjectType === ObjectType.TAG || drawing.activeShapeType === ShapeType.MASK ||
                drawing.activeInteractor) return;

            dispatch(rememberObject({
                ...drawing,
                activeObjectType: drawing.activeObjectType === ObjectType.TRACK ? ObjectType.SHAPE : ObjectType.TRACK,
            }, false));
            dispatch(setContinuedTrack(null));
        },
    };

    return (
        <>
            <GlobalHotKeys
                keyMap={subKeyMap(componentShortcuts, keyMap)}
                handlers={handlers}
            />
            <CVATTooltip title={`Cursor ${cursorShortkey}`} placement='right'>
                <Icon
                    component={CursorIcon}
                    className={
                        activeControl === ActiveControl.CURSOR ?
                            'cvat-active-canvas-control cvat-cursor-control' :
                            'cvat-cursor-control'
                    }
                    onClick={handler}
                />
            </CVATTooltip>
        </>
    );
}

Object.assign(CursorControl, { displayName: 'CursorControl' });
export default React.memo(CursorControl);
