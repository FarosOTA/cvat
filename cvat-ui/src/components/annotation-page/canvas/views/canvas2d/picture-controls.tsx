// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import Popover from 'antd/lib/popover';
import { SlidersOutlined } from '@ant-design/icons';
import ImageSetupsContent from './image-setups-content';

export default function PictureControls(): JSX.Element {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Popover
                open={open}
                placement='topLeft'
                getPopupContainer={(trigger) => trigger.parentElement as HTMLElement}
                overlayClassName='cvat-picture-controls-popover'
                overlayInnerStyle={{ padding: 0 }}
                content={(
                    <div
                        id='cvat-picture-controls-panel'
                        role='dialog'
                        aria-label='Picture controls'
                        onKeyDownCapture={(event) => {
                            if (event.key === 'Escape') {
                                setOpen(false);
                                document.querySelector<HTMLButtonElement>('.cvat-canvas-image-setups-trigger')?.focus();
                                event.stopPropagation();
                            }
                        }}
                    >
                        <ImageSetupsContent />
                    </div>
                )}
            >
                <button
                    type='button'
                    className='cvat-canvas-image-setups-trigger'
                    aria-expanded={open}
                    aria-controls='cvat-picture-controls-panel'
                    onClick={() => setOpen(!open)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') setOpen(false);
                    }}
                >
                    <SlidersOutlined />
                    <span>Picture controls</span>
                </button>
            </Popover>
        </>
    );
}
