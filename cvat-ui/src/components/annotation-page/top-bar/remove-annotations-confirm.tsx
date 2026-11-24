// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import Modal from 'antd/lib/modal';
import Text from 'antd/lib/typography/Text';
import InputNumber from 'antd/lib/input-number';
import Checkbox from 'antd/lib/checkbox';
import Collapse from 'antd/lib/collapse';

import CVATTooltip from 'components/common/cvat-tooltip';

export interface RemoveAnnotationsConfirmProps {
    open: boolean;
    startFrame: number;
    stopFrame: number;
    onClose(): void;
    onRemove(from: number | undefined, to: number | undefined, removeOnlyKeyframes: boolean): void;
}

function RemoveAnnotationsConfirm(props: RemoveAnnotationsConfirmProps): JSX.Element {
    const {
        open,
        startFrame,
        stopFrame,
        onClose,
        onRemove,
    } = props;
    const [removeFrom, setRemoveFrom] = useState<number | undefined>();
    const [removeUpTo, setRemoveUpTo] = useState<number | undefined>();
    const [removeOnlyKeyframes, setRemoveOnlyKeyframes] = useState(false);

    useEffect(() => {
        if (open) {
            setRemoveFrom(undefined);
            setRemoveUpTo(undefined);
            setRemoveOnlyKeyframes(false);
        }
    }, [open]);

    return (
        <Modal
            destroyOnClose
            open={open}
            title='Remove Annotations'
            className='cvat-modal-confirm-remove-annotation'
            okButtonProps={{
                type: 'primary',
                danger: true,
            }}
            okText='Remove'
            onCancel={onClose}
            onOk={() => {
                onRemove(
                    removeFrom === undefined && removeUpTo === undefined ? undefined :
                        Math.min(removeFrom ?? startFrame, removeUpTo ?? stopFrame),
                    removeFrom === undefined && removeUpTo === undefined ? undefined :
                        Math.max(removeFrom ?? startFrame, removeUpTo ?? stopFrame),
                    removeOnlyKeyframes,
                );
                onClose();
            }}
        >
            <div>
                <Text>You are about to remove all annotations from every frame. </Text>
                <Text>If you want to remove them from certain frames only, select a range below. </Text>
                <Text>Changes take effect only when you save the job.</Text>
                <br />
                <br />
                <br />
                <Collapse
                    bordered={false}
                    items={[{
                        key: 1,
                        label: <Text>Select Range</Text>,
                        children: (
                            <>
                                <Text>Lower frame: </Text>
                                <InputNumber
                                    min={startFrame}
                                    max={stopFrame}
                                    onChange={(value) => {
                                        setRemoveFrom(value ?? undefined);
                                    }}
                                />
                                <Text>  Upper frame: </Text>
                                <InputNumber
                                    min={startFrame}
                                    max={stopFrame}
                                    onChange={(value) => {
                                        setRemoveUpTo(value ?? undefined);
                                    }}
                                />
                                <CVATTooltip title='Applicable only for annotations in range'>
                                    <br />
                                    <br />
                                    <Checkbox
                                        checked={removeOnlyKeyframes}
                                        onChange={(check) => {
                                            setRemoveOnlyKeyframes(check.target.checked);
                                        }}
                                    >
                                        Delete only keyframes for tracks
                                    </Checkbox>
                                </CVATTooltip>
                            </>
                        ),
                    }]}
                />
            </div>
        </Modal>
    );
}

export default React.memo(RemoveAnnotationsConfirm);
