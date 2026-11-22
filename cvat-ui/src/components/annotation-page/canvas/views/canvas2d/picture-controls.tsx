// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import Popover from 'antd/lib/popover';
import { SlidersOutlined } from '@ant-design/icons';
import { CombinedState } from 'reducers';
import ImageSetupsContent from './image-setups-content';

export default function PictureControls(): JSX.Element {
    const [open, setOpen] = useState(false);
    const { blackPoint, whitePoint } = useSelector((state: CombinedState) => state.settings.player);
    const slope = 255 / (whitePoint - blackPoint);
    const intercept = -blackPoint / (whitePoint - blackPoint);

    return (
        <>
            <svg width='0' height='0' aria-hidden='true' style={{ position: 'absolute' }}>
                <defs>
                    <filter id='cvat-picture-levels' colorInterpolationFilters='sRGB'>
                        <feComponentTransfer>
                            <feFuncR type='linear' slope={slope} intercept={intercept} />
                            <feFuncG type='linear' slope={slope} intercept={intercept} />
                            <feFuncB type='linear' slope={slope} intercept={intercept} />
                        </feComponentTransfer>
                    </filter>
                </defs>
            </svg>
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
