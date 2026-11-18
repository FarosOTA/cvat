// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

const pendingFeedback = new Set<Promise<void>>();

// Register before saving so an already-loading frame cannot replace the source frame.
export function beginRepeatActionFeedback(): (applied: boolean) => void {
    let release: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    pendingFeedback.add(pending);
    return (applied: boolean): void => {
        const finish = (): void => {
            pendingFeedback.delete(pending);
            release();
        };
        if (applied) window.setTimeout(finish, 350);
        else finish();
    };
}

export async function waitForRepeatActionFeedback(): Promise<void> {
    while (pendingFeedback.size) {
        await Promise.all(pendingFeedback);
    }
}
