// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import Modal from 'antd/lib/modal';
import Form from 'antd/lib/form';
import Select from 'antd/lib/select';
import Input from 'antd/lib/input';
import InputNumber from 'antd/lib/input-number';
import Button from 'antd/lib/button';
import Alert from 'antd/lib/alert';
import { DuplicateRectangleOptions, Label, Source } from 'cvat-core-wrapper';

interface Props {
    labels: Label[];
    startFrame: number;
    stopFrame: number;
    onClose(): void;
    onBack(): void;
    onRemove(options: DuplicateRectangleOptions, expectedIDs?: number[]): Promise<number[]>;
}

export default function RemoveDuplicateAnnotations(props: Props): JSX.Element {
    const {
        labels, startFrame, stopFrame, onClose, onBack, onRemove,
    } = props;
    const [form] = Form.useForm();
    const preference = Form.useWatch('preference', form);
    const [preview, setPreview] = useState<{ options: DuplicateRectangleOptions; ids: number[] } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const attributes = labels.flatMap((label) => label.attributes.filter((attribute) => !attribute.deleted)
        .map((attribute) => ({ value: attribute.id, label: `${label.name} → ${attribute.name}` })));

    const run = async (apply: boolean): Promise<void> => {
        setError('');
        setBusy(true);
        try {
            const values = await form.validateFields();
            const options: DuplicateRectangleOptions = {
                from: Math.min(values.from, values.to),
                to: Math.max(values.from, values.to),
                labelIDs: values.labelIDs,
                iouThreshold: values.overlap / 100,
                keep: values.preference === 'attribute' ?
                    { attributeID: values.attributeID, value: values.value ?? '' } : { source: values.preference },
            };
            if (apply && preview) {
                await onRemove(preview.options, preview.ids);
                onClose();
            } else if (!apply) {
                const ids = await onRemove(options);
                setPreview({ options, ids });
            }
        } catch (reason) {
            setPreview(null);
            if (!('errorFields' in Object(reason))) setError(String(reason));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open
            title='Annotation tools — Remove near-duplicate boxes'
            width={640}
            style={{ top: 24 }}
            styles={{ body: { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' } }}
            onCancel={onClose}
            closable={!busy}
            keyboard={!busy}
            maskClosable={false}
            footer={[
                <div key='result' style={{ marginBottom: 12, textAlign: 'left' }}>
                    {preview && (
                        <Alert
                            type={preview.ids.length ? 'warning' : 'info'}
                            showIcon
                            message={`Near-duplicate boxes to remove: ${preview.ids.length}`}
                        />
                    )}
                    {error && <Alert type='error' showIcon message={error} />}
                </div>,
                <Button key='back' disabled={busy} onClick={onBack}>Back</Button>,
                <Button key='cancel' disabled={busy} onClick={onClose}>Cancel</Button>,
                <Button key='preview' disabled={busy} onClick={() => run(false)}>Preview</Button>,
                <Button
                    key='remove'
                    danger
                    type='primary'
                    loading={busy}
                    disabled={busy || !preview?.ids.length}
                    onClick={() => run(true)}
                >
                    Remove duplicates
                </Button>,
            ]}
        >
            <p>
                Keep all boxes matching the preference. Remove a non-preferred box only when it directly
                matches a preferred box of the same class on the same frame. No preferred match means no removal.
                Manual boxes can be removed when you prefer another source or attribute value.
            </p>
            <Form
                form={form}
                layout='vertical'
                disabled={busy}
                initialValues={{
                    preference: Source.MANUAL, overlap: 90, labelIDs: [], from: startFrame, to: stopFrame,
                }}
                onValuesChange={() => { setPreview(null); setError(''); }}
            >
                <Form.Item label='Keep boxes matching' name='preference'>
                    <Select
                        aria-label='Keep boxes matching'
                        options={[
                            ...[Source.AUTO, Source.SEMI_AUTO, Source.MANUAL].map((source) => (
                                { value: source, label: source }
                            )),
                            { value: 'attribute', label: 'Specific attribute value' },
                        ]}
                    />
                </Form.Item>
                {preference === 'attribute' && (
                    <>
                        <Form.Item label='Attribute (class-specific)' name='attributeID' rules={[{ required: true }]}>
                            <Select aria-label='Attribute' showSearch optionFilterProp='label' options={attributes} />
                        </Form.Item>
                        <Form.Item label='Exact value to keep (case-sensitive; blank matches the empty value)' name='value'>
                            <Input aria-label='Exact attribute value' />
                        </Form.Item>
                    </>
                )}
                <Form.Item label='Classes (empty means all)' name='labelIDs'>
                    <Select
                        aria-label='Duplicate classes'
                        mode='multiple'
                        allowClear
                        optionFilterProp='label'
                        options={labels.map((label) => ({ value: label.id, label: label.name }))}
                    />
                </Form.Item>
                <Form.Item label='Minimum overlap — intersection over union (%)' name='overlap' rules={[{ required: true }]}>
                    <InputNumber aria-label='Minimum overlap' min={50} max={100} precision={0} />
                </Form.Item>
                <Form.Item label='First frame (inclusive)' name='from' rules={[{ required: true }]}>
                    <InputNumber aria-label='First frame' min={startFrame} max={stopFrame} precision={0} />
                </Form.Item>
                <Form.Item label='Last frame (inclusive)' name='to' rules={[{ required: true }]}>
                    <InputNumber aria-label='Last frame' min={startFrame} max={stopFrame} precision={0} />
                </Form.Item>
            </Form>
            <p>
                Standalone, unrotated 2D boxes only. Tracks, other shapes, hidden/locked/outside boxes,
                deleted frames, and sources other than auto/semi-auto/manual are excluded. Conflicting attributes,
                occlusion, groups, or descriptions prevent removal (except the chosen preference attribute).
                Attribute matching uses stored values, including defaults;
                other classes are not matched by attribute name.
            </p>
            <p>Reversed frame bounds are swapped. Removal is undoable; save the job to persist it.</p>
        </Modal>
    );
}
