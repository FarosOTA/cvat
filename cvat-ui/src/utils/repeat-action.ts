// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

export const TOGGLE_LABEL_REPLACEMENT_EVENT = 'cvat.repeat-action.toggle-label-replacement';

const pendingActions = new Set<Promise<void>>();

// Register before saving so an already-loading frame cannot replace the source frame.
export function beginRepeatAction(): () => void {
    let release: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    pendingActions.add(pending);
    return (): void => {
        pendingActions.delete(pending);
        release();
    };
}

export async function waitForRepeatAction(): Promise<void> {
    while (pendingActions.size) {
        await Promise.all(pendingActions);
    }
}
