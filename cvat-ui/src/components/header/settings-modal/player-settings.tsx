// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';

import { Row, Col } from 'antd/lib/grid';
import Checkbox, { CheckboxChangeEvent } from 'antd/lib/checkbox';
import Button from 'antd/lib/button';
import Popover from 'antd/lib/popover';
import InputNumber from 'antd/lib/input-number';
import Text from 'antd/lib/typography/Text';
import { CompactPicker } from 'react-color';

import { clamp } from 'utils/math';
import config from 'config';
import { usePlugins } from 'utils/hooks';

interface Props {
    bandwidthSavingPlayback: boolean;
    frameBufferMultiplier: number;
    rotateAll: boolean;
    canvasBackgroundColor: string;
    onSwitchBandwidthSavingPlayback(enabled: boolean): void;
    onChangeFrameBufferMultiplier(value: number): void;
    onSwitchRotateAll(rotateAll: boolean): void;
    onChangeCanvasBackgroundColor(color: string): void;
}

export default function PlayerSettingsComponent(props: Props): JSX.Element {
    const {
        bandwidthSavingPlayback,
        frameBufferMultiplier,
        rotateAll,
        canvasBackgroundColor,
        onSwitchBandwidthSavingPlayback,
        onChangeFrameBufferMultiplier,
        onSwitchRotateAll,
        onChangeCanvasBackgroundColor,
    } = props;

    const plugins = usePlugins((state) => state.plugins.components.settings.player, props);
    const items: [JSX.Element, number][] = [];

    items.push([(
        <Row key='playback-quality' className='cvat-player-settings-quality cvat-player-setting'>
            <Col span={24}>
                <Checkbox
                    className='cvat-text-color'
                    checked={bandwidthSavingPlayback}
                    onChange={(event: CheckboxChangeEvent): void => {
                        onSwitchBandwidthSavingPlayback(event.target.checked);
                    }}
                >
                    Bandwidth-saving playback (full resolution)
                </Checkbox>
            </Col>
            <Col span={24}>
                <Text type='secondary'>
                    On by default for image jobs: stronger JPEG compression without resizing.
                    Pausing or editing restores task quality. Disable to always use task quality.
                </Text>
            </Col>
        </Row>
    ), 15]);

    items.push([(
        <Row key='frame-buffer' className='cvat-player-settings-buffer cvat-player-setting'>
            <Col span={24}>
                <Text className='cvat-text-color'>Lookaround buffer multiplier </Text>
                <InputNumber
                    id='cvat-player-buffer-multiplier'
                    aria-label='Lookaround buffer multiplier'
                    min={1}
                    max={100}
                    step={1}
                    precision={0}
                    value={frameBufferMultiplier}
                    onChange={(value: number | null): void => {
                        if (value !== null && Number.isFinite(value)) {
                            onChangeFrameBufferMultiplier(Math.floor(clamp(value, 1, 100)));
                        }
                    }}
                />
            </Col>
            <Col span={24}>
                <Text type='secondary'>
                    {`Image jobs: up to ${16 * frameBufferMultiplier} MiB of compressed images `}
                    {`and ${10 * frameBufferMultiplier} chunks, shared ahead and behind. `}
                    Decoded images have a separate 128 MiB budget (at least one frame).
                    Browser, canvas, and in-flight downloads use additional memory.
                    Video buffering is unchanged.
                    Reopen the job or reload the page to apply. Saved in this browser.
                </Text>
            </Col>
        </Row>
    ), 17]);

    items.push([(
        <Row key='canvas-background' className='cvat-player-settings-canvas-background cvat-player-setting'>
            <Col>
                <Popover
                    content={(
                        <CompactPicker
                            colors={config.CANVAS_BACKGROUND_COLORS}
                            color={canvasBackgroundColor}
                            onChange={(e) => onChangeCanvasBackgroundColor(e.hex)}
                        />
                    )}
                    overlayClassName='canvas-background-color-picker-popover'
                    trigger='click'
                >
                    <Button className='cvat-select-canvas-background-color-button' type='default'>
                        Select canvas background color
                    </Button>
                </Popover>
            </Col>
        </Row>
    ), 20]);

    items.push([(
        <Row key='rotate-all' className='cvat-player-settings-rotate-all cvat-player-setting'>
            <Col span={24} className='cvat-player-settings-rotate-all-checkbox'>
                <Checkbox
                    className='cvat-text-color'
                    checked={rotateAll}
                    onChange={(event: CheckboxChangeEvent): void => {
                        onSwitchRotateAll(event.target.checked);
                    }}
                >
                    Rotate all images
                </Checkbox>
            </Col>
            <Col span={24}>
                <Text type='secondary'> Rotate all images simultaneously </Text>
            </Col>
        </Row>
    ), 30]);

    items.push(...plugins.map(({ component: Component, weight }, index: number) => (
        [<Component key={index} targetProps={props} />, weight] as [JSX.Element, number]
    )));

    return (
        <div className='cvat-player-settings'>
            { items.sort((item1, item2) => item1[1] - item2[1])
                .map((item) => item[0]) }
        </div>
    );
}
