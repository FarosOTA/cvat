// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { shallowEqual } from 'utils/redux';
import Modal from 'antd/lib/modal';
import InputNumber from 'antd/lib/input-number';
import Text from 'antd/lib/typography/Text';
import Radio, { RadioChangeEvent } from 'antd/lib/radio';
import { Row, Col } from 'antd/lib/grid';
import Slider from 'antd/lib/slider';
import { clamp } from 'utils/math';
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { propagateObjectAsync, switchPropagateVisibility } from 'actions/annotation-actions';
import { CombinedState } from 'reducers';

export enum PropagateDirection {
    FORWARD = 'forward',
    BACKWARD = 'backward',
}

function PropagateConfirmComponent(): JSX.Element {
    const dispatch = useDispatch();
    const {
        visible,
        frameNumber,
        frameNumbers,
        reverseAnnotation,
    } = useSelector((state: CombinedState) => ({
        visible: state.annotation.propagate.visible,
        frameNumber: state.annotation.player.frame.number,
        frameNumbers: state.annotation.job.frameNumbers.filter((frame) => state.settings.player.showDeletedFrames ||
            !state.annotation.job.meta?.deletedFrames[frame]),
        reverseAnnotation: state.settings.player.reverseAnnotation,
    }), shallowEqual);

    const [targetFrame, setTargetFrame] = useState<number>(frameNumber);
    const startFrame = frameNumbers[0] ?? frameNumber;
    const stopFrame = frameNumbers[frameNumbers.length - 1] ?? frameNumber;
    const propagateFrames = frameNumbers.filter((frame) => frame !== frameNumber &&
        frame >= Math.min(frameNumber, targetFrame) && frame <= Math.max(frameNumber, targetFrame)).length;
    const propagateDirection = (targetFrame >= frameNumber) !== reverseAnnotation ?
        PropagateDirection.FORWARD : PropagateDirection.BACKWARD;
    const forwardBoundary = reverseAnnotation ? startFrame : stopFrame;
    const backwardBoundary = reverseAnnotation ? stopFrame : startFrame;

    useEffect(() => {
        setTargetFrame(forwardBoundary !== frameNumber ? forwardBoundary : backwardBoundary);
    }, [visible, reverseAnnotation, frameNumber, forwardBoundary, backwardBoundary]);

    const updateTargetFrame = (direction: PropagateDirection, _propagateFrames: number): void => {
        const increasing = (direction === PropagateDirection.FORWARD) !== reverseAnnotation;
        const candidates = frameNumbers.filter((frame) => (increasing ? frame > frameNumber : frame < frameNumber));
        if (!increasing) candidates.reverse();
        const count = Math.min(candidates.length, Math.max(0, Math.round(_propagateFrames)));
        setTargetFrame(count ? candidates[count - 1] : frameNumber);
    };

    return (
        <Modal
            okType='primary'
            okText='Yes'
            cancelText='Cancel'
            onOk={() => {
                dispatch(propagateObjectAsync(frameNumber, targetFrame))
                    .then(() => dispatch(switchPropagateVisibility(false)));
            }}
            onCancel={() => dispatch(switchPropagateVisibility(false))}
            title='Confirm propagation'
            open={visible}
            destroyOnClose
            okButtonProps={{ disabled: !propagateFrames }}
        >
            <div className='cvat-propagate-confirm'>
                <Row>
                    <Col>
                        <Text>Please, specify a direction</Text>
                    </Col>
                    <Col offset={1}>
                        <Radio.Group
                            size='small'
                            value={propagateDirection}
                            onChange={(e: RadioChangeEvent) => updateTargetFrame(e.target.value, propagateFrames)}
                        >
                            <Radio.Button
                                disabled={frameNumber === backwardBoundary}
                                value={PropagateDirection.BACKWARD}
                            >
                                <ArrowLeftOutlined />
                            </Radio.Button>
                            <Radio.Button disabled={frameNumber === forwardBoundary} value={PropagateDirection.FORWARD}>
                                <ArrowRightOutlined />
                            </Radio.Button>
                        </Radio.Group>
                    </Col>
                </Row>
                <Row>
                    <Col>How many copies do you want to create?</Col>
                    <Col offset={1}>
                        <InputNumber
                            className='cvat-propagate-confirm-object-on-frames'
                            size='small'
                            min={0}
                            value={propagateFrames}
                            onChange={(value: number | null) => {
                                if (typeof value === 'number') {
                                    updateTargetFrame(propagateDirection, value);
                                }
                            }}
                        />
                    </Col>
                </Row>
                <hr />
                <Row className='cvat-propagate-up-to-wrapper'>
                    <Col span={24}>
                        <Text>Or specify a range where copies will be created </Text>
                    </Col>
                    <Col className='cvat-propagate-slider-wrapper' span={12} offset={1}>
                        <Slider
                            range
                            reverse={reverseAnnotation}
                            min={startFrame}
                            max={stopFrame}
                            marks={frameNumber !== targetFrame ? {
                                [frameNumber]: 'FROM',
                                [targetFrame]: 'TO',
                            } : undefined}
                            onChange={([value1, value2]: number[]) => {
                                const value = value1 === frameNumber || value1 === targetFrame ? value2 : value1;
                                if (value < frameNumber) {
                                    setTargetFrame(clamp(value, startFrame, frameNumber));
                                } else {
                                    setTargetFrame(clamp(value, frameNumber, stopFrame));
                                }
                            }}
                            value={[Math.min(frameNumber, targetFrame), Math.max(frameNumber, targetFrame)]}
                        />
                    </Col>
                    <Col span={4}>
                        <InputNumber
                            size='small'
                            className='cvat-propagate-confirm-up-to-input'
                            min={startFrame}
                            max={stopFrame}
                            value={targetFrame}
                            onChange={(value: number | null) => {
                                if (typeof value === 'number') {
                                    if (value > frameNumber) {
                                        setTargetFrame(clamp(+value, frameNumber, stopFrame));
                                    } else if (value < frameNumber) {
                                        setTargetFrame(clamp(+value, startFrame, frameNumber));
                                    } else {
                                        setTargetFrame(frameNumber);
                                    }
                                }
                            }}
                        />
                    </Col>
                </Row>
            </div>
        </Modal>
    );
}

export default React.memo(PropagateConfirmComponent);
