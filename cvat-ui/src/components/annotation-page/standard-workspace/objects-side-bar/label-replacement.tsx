// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Select from 'antd/lib/select';
import Text from 'antd/lib/typography/Text';

import { setLabelReplacement } from 'actions/annotation-actions';
import { Label, LabelType } from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';

export default function LabelReplacement(): JSX.Element {
    const dispatch = useDispatch();
    const { sourceLabelID, targetLabelID } = useSelector(
        (state: CombinedState) => state.annotation.labelReplacement,
    );
    const labels = useSelector((state: CombinedState) => state.annotation.job.instance.labels);
    const options = labels.filter((label: Label) => (
        !label.hasParent && ![LabelType.SKELETON, LabelType.TAG].includes(label.type)
    )).map((label: Label) => ({ value: label.id, label: label.name }));

    return (
        <div className='cvat-label-replacement'>
            <Text id='cvat-label-replacement-current-label'>Current label</Text>
            <Select
                id='cvat-label-replacement-current'
                aria-labelledby='cvat-label-replacement-current-label'
                placeholder='Select the label to replace'
                showSearch
                optionFilterProp='label'
                options={options}
                value={sourceLabelID}
                onChange={(source: number) => dispatch(setLabelReplacement({ sourceLabelID: source }))}
            />
            <Text id='cvat-label-replacement-new-label'>New label</Text>
            <Select
                id='cvat-label-replacement-new'
                aria-labelledby='cvat-label-replacement-new-label'
                placeholder='Select the replacement label'
                showSearch
                optionFilterProp='label'
                options={options}
                value={targetLabelID}
                onChange={(target: number) => dispatch(setLabelReplacement({ targetLabelID: target }))}
            />
            {sourceLabelID !== null && sourceLabelID === targetLabelID && (
                <Text type='warning'>Choose different current and new labels.</Text>
            )}
            <Text type='secondary'>
                Repeat apply label (Shift+L by default) replaces only the current label inside the brush.
                Other labels and locked annotations are unchanged. Press Escape to stop.
            </Text>
        </div>
    );
}
