// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Radio from 'antd/lib/radio';
import { getCore } from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';
import { changeFrameAsync, switchPlay } from 'actions/annotation-actions';
import { shallowEqual } from 'utils/redux';

function Thumbnail({ jobID, frame }: { jobID: number; frame: number }): JSX.Element {
    const [source, setSource] = useState('');
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        let url = '';
        setSource('');
        setFailed(false);
        const core = getCore();
        core.server.request(`${core.config.backendAPI}/jobs/${jobID}/data`, {
            params: { type: 'frame', quality: 'compressed', number: frame },
            responseType: 'blob',
            signal: controller.signal,
        }).then((response) => {
            if (!controller.signal.aborted) {
                url = URL.createObjectURL((response as { data: Blob }).data);
                setSource(url);
            }
        }).catch(() => {
            if (!controller.signal.aborted) setFailed(true);
        });
        return () => {
            controller.abort();
            if (url) URL.revokeObjectURL(url);
        };
    }, [jobID, frame]);

    return source ? <img src={source} alt='' draggable={false} /> : (
        <span className='cvat-frame-timeline-placeholder'>{failed ? 'Unavailable' : 'Loading…'}</span>
    );
}

export default function FrameTimeline({ frames }: { frames: number[] }): JSX.Element {
    const dispatch = useDispatch<any>();
    const {
        frame, frameNumbers, job, playing,
    } = useSelector((state: CombinedState) => ({
        frame: state.annotation.player.frame.number,
        frameNumbers: state.annotation.job.frameNumbers,
        job: state.annotation.job.instance,
        playing: state.annotation.player.playing,
    }), shallowEqual);
    const [nearby, setNearby] = useState(false);
    const [draft, setDraft] = useState<number | null>(null);
    const [center, setCenter] = useState(frame);

    useEffect(() => {
        // Playback must not fetch a new set of thumbnails on every frame.
        if (!playing) setCenter(frame);
    }, [frame, playing]);

    const index = Math.max(0, frames.indexOf(frame));
    const centerIndex = Math.max(0, frames.indexOf(center));
    // Keep the nearby window still while dragging; only a committed seek recenters it.
    const start = nearby ? Math.max(0, Math.min(centerIndex - 5, frames.length - 11)) : 0;
    const end = nearby ? Math.min(frames.length - 1, start + 10) : frames.length - 1;
    const selected = draft ?? index;
    const samples = useMemo(() => {
        const count = Math.min(12, end - start + 1);
        return Array.from({ length: count }, (_, offset) => (
            start + Math.round((offset / Math.max(1, count - 1)) * (end - start))
        ));
    }, [start, end]);
    const seek = (target: number): void => {
        setDraft(null);
        dispatch(switchPlay(false));
        if (frames[target] !== undefined) dispatch(changeFrameAsync(frames[target]));
    };
    const position = (Math.min(end, Math.max(start, selected)) - start) / Math.max(1, end - start);

    if (!frames.length) return <div className='cvat-rectangle-track-timeline-empty'>No available frames.</div>;

    return (
        <div className='cvat-frame-timeline'>
            <div className='cvat-frame-timeline-toolbar'>
                <span><strong>{`Frame ${frames[selected] ?? frame}`}</strong>{` / ${frameNumbers.at(-1)}`}</span>
                <span className='cvat-frame-timeline-hint'>Click a thumbnail or scrub to a frame</span>
                <Radio.Group
                    size='small'
                    value={nearby}
                    onChange={(event) => { setDraft(null); setNearby(event.target.value); }}
                    aria-label='Frame timeline scale'
                >
                    <Radio.Button value={false}>Whole job</Radio.Button>
                    <Radio.Button value>Nearby</Radio.Button>
                </Radio.Group>
            </div>
            <div className='cvat-frame-timeline-strip'>
                {samples.map((sample) => (
                    <button
                        type='button'
                        key={frames[sample]}
                        aria-label={`Go to frame ${frames[sample]}`}
                        aria-current={sample === index ? 'true' : undefined}
                        onClick={() => seek(sample)}
                    >
                        <Thumbnail jobID={job.id} frame={frames[sample]} />
                        <span className='cvat-frame-timeline-number'>{frames[sample]}</span>
                    </button>
                ))}
                <span
                    className='cvat-frame-timeline-playhead'
                    aria-hidden='true'
                    style={{
                        left: `${((0.5 + position * (samples.length - 1)) / samples.length) * 100}%`,
                    }}
                />
            </div>
            <div className='cvat-frame-timeline-scrubber'>
                <input
                    type='range'
                    aria-label='Frame timeline scrubber'
                    aria-valuetext={`Frame ${frames[selected] ?? frame}`}
                    min={start}
                    max={end}
                    value={Math.min(end, Math.max(start, selected))}
                    disabled={start === end}
                    onChange={(event) => setDraft(+event.target.value)}
                    onPointerUp={(event) => seek(+event.currentTarget.value)}
                    onPointerCancel={() => setDraft(null)}
                    onKeyUp={(event) => {
                        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']
                            .includes(event.key)) {
                            event.stopPropagation();
                            seek(+event.currentTarget.value);
                        }
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    onBlur={() => setDraft(null)}
                />
                <div><span>{frames[start]}</span><span>{frames[end]}</span></div>
            </div>
        </div>
    );
}
