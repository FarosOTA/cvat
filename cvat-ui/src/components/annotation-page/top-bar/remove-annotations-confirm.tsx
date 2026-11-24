// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import Modal from 'antd/lib/modal';
import Text from 'antd/lib/typography/Text';
import InputNumber from 'antd/lib/input-number';
import Checkbox from 'antd/lib/checkbox';
import Collapse from 'antd/lib/collapse';
import Select from 'antd/lib/select';
import { DuplicateRectangleOptions, Label, Source } from 'cvat-core-wrapper';

import CVATTooltip from 'components/common/cvat-tooltip';
import RemoveDuplicateAnnotations from './remove-duplicate-annotations';

export interface RemoveAnnotationsConfirmProps {
    open: boolean;
    startFrame: number;
    stopFrame: number;
    labels?: Label[];
    onRemoveDuplicates?(options: DuplicateRectangleOptions, expectedIDs?: number[]): Promise<number[]>;
    onClose(): void;
    onRemove(
        from: number | undefined, to: number | undefined, removeOnlyKeyframes: boolean,
        labelIDs?: number[], sources?: Source[],
    ): void;
}

function RemoveAnnotationsConfirm(props: RemoveAnnotationsConfirmProps): JSX.Element {
    const {
        open,
        startFrame,
        stopFrame,
        labels = [],
        onRemoveDuplicates,
        onClose,
        onRemove,
    } = props;
    const [removeFrom, setRemoveFrom] = useState<number | undefined>();
    const [removeUpTo, setRemoveUpTo] = useState<number | undefined>();
    const [removeOnlyKeyframes, setRemoveOnlyKeyframes] = useState(false);
    const [labelIDs, setLabelIDs] = useState<number[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [tool, setTool] = useState('remove');

    useEffect(() => {
        if (open) {
            setRemoveFrom(undefined);
            setRemoveUpTo(undefined);
            setRemoveOnlyKeyframes(false);
            setLabelIDs([]);
            setSources([]);
            setTool('remove');
        }
    }, [open]);

    if (open && tool === 'duplicates' && onRemoveDuplicates) {
        return (
            <RemoveDuplicateAnnotations
                labels={labels}
                startFrame={startFrame}
                stopFrame={stopFrame}
                onClose={onClose}
                onBack={() => setTool('remove')}
                onRemove={onRemoveDuplicates}
            />
        );
    }

    return (
        <Modal
            destroyOnClose
            open={open}
            title='Annotation tools'
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
                    labelIDs,
                    sources,
                );
                onClose();
            }}
        >
            <div>
                {onRemoveDuplicates && (
                    <Select
                        aria-label='Annotation tool'
                        style={{ width: '100%', marginBottom: 16 }}
                        value={tool}
                        onChange={setTool}
                        options={[
                            { value: 'remove', label: 'Remove annotations by criteria' },
                            { value: 'duplicates', label: 'Remove near-duplicate boxes' },
                        ]}
                    />
                )}
                <Text strong>Remove annotations</Text>
                <p>
                    Remove annotations matching all selected criteria. Multiple classes or sources match any
                    selected value. Leave a criterion empty to include all values.
                </p>
                <Text>Changes are saved only when you save the job. This clears undo/redo history.</Text>
                <p><Text strong>Classes</Text></p>
                <Select
                    aria-label='Classes'
                    mode='multiple'
                    allowClear
                    style={{ width: '100%' }}
                    placeholder='All classes'
                    optionFilterProp='label'
                    value={labelIDs}
                    onChange={setLabelIDs}
                    options={labels.map((label) => ({ value: label.id, label: label.name }))}
                />
                <p><Text strong>Annotation sources</Text></p>
                <Select
                    aria-label='Annotation sources'
                    mode='multiple'
                    allowClear
                    style={{ width: '100%' }}
                    placeholder='All sources'
                    optionFilterProp='label'
                    value={sources}
                    onChange={setSources}
                    options={Object.values(Source).map((source) => ({ value: source, label: source }))}
                />
                <p>
                    {!labelIDs.length && !sources.length && removeFrom === undefined && removeUpTo === undefined ?
                        'All annotations in this job will be removed.' :
                        'Only annotations matching the selected classes, sources, and frame range will be removed.'}
                </p>
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
                                    aria-label='Lower frame'
                                    precision={0}
                                    value={removeFrom}
                                    min={startFrame}
                                    max={stopFrame}
                                    onChange={(value) => {
                                        setRemoveFrom(value ?? undefined);
                                    }}
                                />
                                <Text>  Upper frame: </Text>
                                <InputNumber
                                    aria-label='Upper frame'
                                    precision={0}
                                    value={removeUpTo}
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
                                <p>
                                    Bounds are inclusive; empty bounds use the job limits and reversed bounds
                                    are swapped. By default, whole tracks are removed only when their start
                                    frame is in range. Keyframe-only deletion can change interpolation outside
                                    the range; it does not cut a gap in a track.
                                </p>
                            </>
                        ),
                    }]}
                />
            </div>
        </Modal>
    );
}

export default React.memo(RemoveAnnotationsConfirm);
