// Copyright (C) 2021-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect } from 'react';
import Mousetrap from 'mousetrap';
import { ShortcutScope } from './enums';

export interface KeyMapItem {
    name: string;
    description: string;
    sequences: string[];
    displayedSequences?: string[];
    scope: ShortcutScope;
    nonActive?: boolean;
    applicable?: string[];
    displayWeight?: number;
}

export interface KeyMap {
    [index: string]: KeyMapItem;
}

export interface Handlers {
    // Return true to preserve native behavior and propagation; otherwise consume the shortcut.
    [index: string]: (event: KeyboardEvent, shortcut: string) => boolean | void;
}

interface Props {
    children?: JSX.Element;
    keyMap: KeyMap;
    handlers: Handlers;
}

const applicationKeyMap: KeyMap = {};
const canvasCancelShortcuts = ['CANCEL', 'CANCEL_SINGLE_SHAPE', 'CANCEL_AUDIO'];

export default function GlobalHotKeys(props: Props): JSX.Element {
    const { children, keyMap, handlers } = props;
    useEffect(() => {
        const boundKeyMap: KeyMap = {};
        const escapeListeners: ((event: KeyboardEvent) => void)[] = [];
        for (const key of Object.keys(keyMap)) {
            const { sequences } = keyMap[key];
            const handler = handlers[key];
            if (!handler) {
                continue;
            }
            const captureEscape = canvasCancelShortcuts.includes(key) && sequences.includes('esc');
            if (captureEscape) {
                // Selects and other editors can stop bubbling before Mousetrap sees Escape.
                // Cancel on capture, but let the same key close the focused dropdown as well.
                const listener = (event: KeyboardEvent): void => {
                    if (event.key === 'Escape' &&
                        !Mousetrap.prototype.stopCallback(event, event.target as Element, 'esc')) {
                        if (handler(event, 'esc') !== true) event.preventDefault();
                    }
                };
                document.addEventListener('keydown', listener, true);
                escapeListeners.push(listener);
            }
            const boundSequences = captureEscape ? sequences.filter((sequence) => sequence !== 'esc') : sequences;
            Mousetrap.bind(boundSequences, (event, combo) => {
                if (handler(event, combo) !== true) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }, 'keydown');
            boundKeyMap[key] = { ...keyMap[key], sequences: boundSequences };
            applicationKeyMap[key] = keyMap[key];
        }

        return () => {
            escapeListeners.forEach((listener) => document.removeEventListener('keydown', listener, true));
            for (const key of Object.keys(boundKeyMap)) {
                const { sequences } = boundKeyMap[key];
                Mousetrap.unbind(sequences, 'keydown');
                delete applicationKeyMap[key];
            }
        };
    });
    return children || <></>;
}

Mousetrap.prototype.stopCallback = function (_e: KeyboardEvent, element: Element, combo: string): boolean {
    const cancelEscape = combo === 'esc' && canvasCancelShortcuts.some((key) => (
        applicationKeyMap[key]?.sequences.includes('esc')
    ));
    if (!cancelEscape && (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA' ||
        (element as HTMLElement).isContentEditable)) {
        // Leave typing alone, but cancellation must also work while an editor has focus.
        return true;
    }

    // stop when modals are opened
    const anyModalsOpened = Array.from(
        window.document.getElementsByClassName('ant-modal'),
    ).some((el) => (el as HTMLElement).style.display !== 'none');

    if (anyModalsOpened) {
        const modalClosingSequences = ['SWITCH_SHORTCUTS', 'SWITCH_SETTINGS']
            .map((key) => [...(applicationKeyMap[key]?.sequences ?? [])]).flat();

        return !modalClosingSequences.some((seq) => {
            const seqFragments = seq.split('+');
            return combo.split('+').every((key, i) => seqFragments[i] === key);
        });
    }

    return false;
};

export function getApplicationKeyMap(): KeyMap {
    return {
        ...applicationKeyMap,
    };
}
