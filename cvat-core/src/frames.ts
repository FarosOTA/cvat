// Copyright (C) 2021-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import _, { range, sortedIndexOf } from 'lodash';
import {
    FrameDecoder, ImageFrameBuffer, BlockType, DimensionType, ChunkQuality, decodeContextImages, RequestOutdatedError,
} from 'cvat-data';
import PluginRegistry from './plugins';
import { MediaType } from './enums';
import serverProxy, { PREVIEW_DEFAULT, PreviewResponse } from './server-proxy';
import { SerializedChapterMetaData, SerializedFramesMetaData } from './server-response-types';
import { ArgumentError } from './exceptions';
import { FieldUpdateTrigger } from './common';
import config from './config';

export interface FrameChunkRequestOptions {
    signal?: AbortSignal;
    maxContentLength?: number;
}

// frame storage by job id
const frameDataCache: Record<string, {
    metaFetchedTimestamp: number;
    chunkSize: number;
    mode: 'annotation' | 'interpolation';
    jobStartFrame: number;
    decodeForward: boolean;
    forwardStep: number;
    latestFrameDecodeRequest: number | null;
    latestContextImagesRequest: number | null;
    provider: FrameDecoder;
    decodedBlocksCacheSize: number;
    frameBufferMultiplier: number;
    currentChunkIndex: number;
    prefetch: () => void;
    activeChunkRequest: Promise<void> | null;
    activeContextRequest: Promise<Record<number, ImageBitmap>> | null;
    segmentFrameNumbers: number[];
    contextCache: Record<number, {
        data: Record<number, ImageBitmap>;
        timestamp: number;
        size: number;
    }>;
    getChunk: (chunkIndex: number, quality: ChunkQuality, options?: FrameChunkRequestOptions) => Promise<ArrayBuffer>;
    getMeta: () => Promise<FramesMetaData>;
    previewUnavailable?: boolean;
    playbackPrimed?: boolean;
    imageFrames?: boolean;
    imageBuffer?: ImageFrameBuffer;
    imageBufferPlayback?: boolean;
    refinedImage?: ImageBitmap;
    refinementController?: AbortController;
}> = {};

// frame meta data storage by job id
const frameMetaCacheSync: Record<string, FramesMetaData> = {};
const frameMetaCache: Record<string, Promise<FramesMetaData>> = new Proxy({}, {
    set(target, prop, value): boolean {
        if (typeof prop === 'string' && value instanceof Promise) {
            const result = Reflect.set(target, prop, value);

            // automatically update synced storage each time new promise set
            if (result) {
                value.then((metaData: FramesMetaData) => {
                    if (target[prop]) {
                        frameMetaCacheSync[prop] = metaData;
                    }
                }).catch(() => {
                    // do nothing
                });
            }

            return result;
        }
        return Reflect.set(target, prop, value);
    },
    deleteProperty(target, prop): boolean {
        if (typeof prop === 'string') {
            const result = Reflect.deleteProperty(target, prop);
            if (result) {
                delete frameMetaCacheSync[prop];
            }
            return result;
        }

        return Reflect.deleteProperty(target, prop);
    },
});

enum DeletedFrameState {
    DELETED = 'deleted',
    RESTORED = 'restored',
}

interface FramesMetaDataUpdatedData {
    cloudStorageId?: boolean;
    deletedFrames?: Record<number, DeletedFrameState>;
}

export class ChapterMetaData {
    readonly #title: string;

    constructor(initialData: SerializedChapterMetaData) {
        this.#title = initialData.title;
    }

    get title(): string {
        return this.#title;
    }
}

export class Chapter {
    public id: number;
    public start: number;
    public stop: number;
    public metadata: ChapterMetaData;
}

export class FramesMetaData {
    public chunkSize: number;
    public chapters: Chapter[] | null;
    public deletedFrames: Record<number, boolean>;
    public includedFrames: number[] | null;
    public frameFilter: string;
    public frames: {
        width: number;
        height: number;
        name: string;
        related_files: number;
    }[];
    public imageQuality: number;
    public size: number;
    public startFrame: number;
    public stopFrame: number;
    public frameStep: number;
    public chunkCount: number;
    public chunksUpdatedDate: string;
    public storage: string;
    public cloudStorageId: number | null;

    #updateTrigger: FieldUpdateTrigger;

    constructor(initialData: Omit<SerializedFramesMetaData, 'deleted_frames'> & { deleted_frames: Record<number, boolean> }) {
        const data: typeof initialData = {
            chunk_size: undefined,
            chapters: [],
            deleted_frames: {},
            included_frames: null,
            frame_filter: undefined,
            frames: [],
            image_quality: undefined,
            size: undefined,
            start_frame: undefined,
            stop_frame: undefined,
            chunks_updated_date: undefined,
            storage: undefined,
            cloud_storage_id: undefined,
        };

        this.#updateTrigger = new FieldUpdateTrigger();

        for (const property in data) {
            if (Object.prototype.hasOwnProperty.call(data, property) && property in initialData) {
                if (property === 'deleted_frames') {
                    const update = (frame: string, remove: boolean): void => {
                        const [state, oppositeState] = remove ?
                            [DeletedFrameState.DELETED, DeletedFrameState.RESTORED] :
                            [DeletedFrameState.RESTORED, DeletedFrameState.DELETED];
                        if (this.#updateTrigger.get(`deletedFrames:${frame}:${oppositeState}`)) {
                            this.#updateTrigger.resetField(`deletedFrames:${frame}:${oppositeState}`);
                        } else {
                            this.#updateTrigger.update(`deletedFrames:${frame}:${state}`);
                        }
                    };

                    const handler = {
                        set: (target, prop, value) => {
                            update(prop, value);
                            return Reflect.set(target, prop, value);
                        },
                        deleteProperty: (target, prop) => {
                            if (prop in target) {
                                update(prop, false);
                            }
                            return Reflect.deleteProperty(target, prop);
                        },
                    };
                    data[property] = new Proxy(initialData[property], handler);
                } else {
                    data[property] = initialData[property];
                }
            }
        }

        const frameStep: number = (() => {
            if (data.frame_filter) {
                const frameStepParts = data.frame_filter.split('=', 2);
                if (frameStepParts.length !== 2) {
                    throw new ArgumentError(`Invalid frame filter '${data.frame_filter}'`);
                }
                return +frameStepParts[1];
            }
            return 1;
        })();

        Object.defineProperties(
            this,
            Object.freeze({
                chunkSize: {
                    get: () => data.chunk_size,
                },
                chapters: {
                    get: () => data.chapters,
                },
                deletedFrames: {
                    get: () => data.deleted_frames,
                },
                includedFrames: {
                    get: () => data.included_frames,
                },
                frameFilter: {
                    get: () => data.frame_filter,
                },
                imageQuality: {
                    get: () => data.image_quality,
                },
                size: {
                    get: () => data.size,
                },
                startFrame: {
                    get: () => data.start_frame,
                },
                stopFrame: {
                    get: () => data.stop_frame,
                },
                frameStep: {
                    get: () => frameStep,
                },
                chunksUpdatedDate: {
                    get: () => data.chunks_updated_date,
                },
                storage: {
                    get: () => data.storage,
                },
                cloudStorageId: {
                    get: () => data.cloud_storage_id,
                    set: (cloudStorageId) => {
                        this.#updateTrigger.update('cloudStorageId');
                        data.cloud_storage_id = cloudStorageId;
                    },
                },
            }),
        );

        const frameNumbers = this.getDataFrameNumbers();
        const chunkCount: number = Math.ceil(frameNumbers.length / this.chunkSize);

        let framesInfo = [];
        if (initialData.frames.length === 1) {
            // it may be a videofile or one image
            framesInfo = frameNumbers.map(() => initialData.frames[0]);
        } else if (this.includedFrames?.length) {
            // Only simple GT jobs have includedFrames, so this condition works only for them
            const framesNumbers = new Set(this.includedFrames.map((dataFrameNumber: number) => (
                Math.floor((dataFrameNumber - this.startFrame) / this.frameStep)
            )));
            // Frames must contain placeholders on positions out of includedFrames.
            // That is, we can use frames with indices corresponding to frame numbers
            framesInfo = initialData.frames.filter((frame, idx) => framesNumbers.has(idx));
        } else {
            framesInfo = initialData.frames;
        }

        Object.defineProperties(
            this,
            Object.freeze({
                chunkCount: {
                    get: () => chunkCount,
                },
                frames: {
                    get: () => framesInfo,
                },
            }),
        );
    }

    getDataFrameNumber(jobRelativeFrame: number): number {
        return this.frameStep * jobRelativeFrame + this.startFrame;
    }

    getJobRelativeFrameNumber(dataFrameNumber: number): number {
        return (dataFrameNumber - this.startFrame) / this.frameStep;
    }

    getUpdated(): FramesMetaDataUpdatedData {
        const updatedFields: FramesMetaDataUpdatedData = {};
        for (const key of Object.keys(this.#updateTrigger.getUpdated(this))) {
            if (key.startsWith('deletedFrames')) {
                updatedFields.deletedFrames = updatedFields.deletedFrames ?? {};
                const [, frame, state] = key.split(':');
                updatedFields.deletedFrames[frame] = state;
            } else if (key === 'cloudStorageId') {
                updatedFields.cloudStorageId = true;
            }
        }
        return updatedFields;
    }

    resetUpdated(): void {
        this.#updateTrigger.reset();
    }

    getFrameIndex(dataFrameNumber: number): number {
        // Here we use absolute (task source data) frame numbers.
        // TODO: migrate from data frame numbers to local frame numbers to simplify code.
        // Requires server changes in api/jobs/{id}/data/meta/
        // for included_frames, start_frame, stop_frame fields

        if (dataFrameNumber < this.startFrame || dataFrameNumber > this.stopFrame) {
            throw new ArgumentError(`Frame number ${dataFrameNumber} doesn't belong to the job`);
        }

        let frameIndex = null;
        if (this.includedFrames) {
            frameIndex = sortedIndexOf(this.includedFrames, dataFrameNumber);
            if (frameIndex === -1) {
                throw new ArgumentError(`Frame number ${dataFrameNumber} doesn't belong to the job`);
            }
        } else {
            frameIndex = Math.floor((dataFrameNumber - this.startFrame) / this.frameStep);
        }
        return frameIndex;
    }

    getFrameChunkIndex(dataFrameNumber: number): number {
        return Math.floor(this.getFrameIndex(dataFrameNumber) / this.chunkSize);
    }

    getSegmentFrameNumbers(jobStartFrame: number): number[] {
        const frames = this.getDataFrameNumbers();
        return frames.map((frame) => this.getJobRelativeFrameNumber(frame) + jobStartFrame);
    }

    getDataFrameNumbers(): number[] {
        if (this.includedFrames) {
            return this.includedFrames.slice(0);
        }

        return range(this.startFrame, this.stopFrame + 1, this.frameStep);
    }
}

const individualFrames = new WeakMap<FrameData, {
    cache: typeof frameDataCache[string];
    controller: AbortController;
    data: ReturnType<FrameData['data']>;
    image?: ImageBitmap;
}>();

function getIndividualFrame(
    frame: FrameData, onServerRequest: () => void, fallbackToChunks = true,
): ReturnType<FrameData['data']> {
    const cache = frameDataCache[frame.jobID];
    const cached = individualFrames.get(frame);
    if (cached?.cache === cache && (!cached.image || cached.image === cache.refinedImage)) return cached.data;
    onServerRequest();
    cache.refinementController?.abort();
    const controller = new AbortController();
    cache.refinementController = controller;
    const data = serverProxy.frames.getFrame(frame.jobID, frame.number, controller.signal)
        .then((blob) => createImageBitmap(blob))
        .then((imageData) => {
            if (frameDataCache[frame.jobID] !== cache || controller.signal.aborted) {
                imageData.close();
                throw frame.number;
            }
            cache.refinedImage?.close();
            cache.refinedImage = imageData;
            individualFrames.get(frame).image = imageData;
            return { renderWidth: frame.width, renderHeight: frame.height, imageData };
        }).catch((error) => {
            if (individualFrames.get(frame)?.controller === controller) individualFrames.delete(frame);
            if (controller.signal.aborted) throw frame.number;
            if (frameDataCache[frame.jobID] === cache && fallbackToChunks) return frame.data(onServerRequest);
            throw error;
        });
    individualFrames.set(frame, { cache, controller, data });
    return data;
}

export class FrameData {
    public readonly filename: string;
    public readonly width: number;
    public readonly height: number;
    public readonly number: number;
    public readonly relatedFiles: number;
    public readonly deleted: boolean;
    public readonly jobID: number;
    readonly #previewKey: string | null;

    constructor({
        width,
        height,
        name,
        jobID,
        frameNumber,
        deleted,
        related_files: relatedFiles,
        previewKey = null,
    }) {
        this.#previewKey = previewKey;
        Object.defineProperties(
            this,
            Object.freeze({
                filename: {
                    value: name,
                    writable: false,
                },
                width: {
                    value: width,
                    writable: false,
                },
                height: {
                    value: height,
                    writable: false,
                },
                jobID: {
                    value: jobID,
                    writable: false,
                },
                number: {
                    value: frameNumber,
                    writable: false,
                },
                relatedFiles: {
                    value: relatedFiles,
                    writable: false,
                },
                deleted: {
                    value: deleted,
                    writable: false,
                },
            }),
        );
    }

    async data(onServerRequest = () => {}, representation: boolean | 'frame' | 'buffered' = false): Promise<{
        renderWidth: number;
        renderHeight: number;
        imageData: ImageBitmap | Blob;
    }> {
        const result = await PluginRegistry.apiWrapper.call(
            this, FrameData.prototype.data, onServerRequest,
            representation === true ? this.#previewKey : null,
            (representation === 'frame' || representation === 'buffered') && this.#previewKey !== null,
        );
        if (representation === 'buffered' && this.#previewKey !== null) {
            // Do not compete with the first full-quality image's transfer.
            // Once it arrives, fill the normal chunk cache even while paused.
            this.data().catch(() => {});
        }
        return result;
    }

    cancelRefinement(): void {
        const refinement = individualFrames.get(this);
        refinement?.controller.abort();
        individualFrames.delete(this);
    }
}

Object.defineProperty(FrameData.prototype.data, 'implementation', {
    async value(this: FrameData, onServerRequest, previewKey: string | null, individualFrame: boolean) {
        const baseCache = frameDataCache[this.jobID];
        if (baseCache.imageFrames && !individualFrame) {
            const playback = !!previewKey && !baseCache.previewUnavailable;
            if (!baseCache.imageBuffer || baseCache.imageBufferPlayback !== playback) {
                baseCache.imageBuffer?.close();
                baseCache.imageBufferPlayback = playback;
                const encodedBytes = 16 * baseCache.frameBufferMultiplier * 1024 * 1024;
                baseCache.imageBuffer = new ImageFrameBuffer({
                    frames: baseCache.segmentFrameNumbers,
                    chunkSize: baseCache.chunkSize,
                    chunkLimit: 10 * baseCache.frameBufferMultiplier,
                    encodedBytes,
                    decodedBytes: 128 * 1024 * 1024,
                    getChunk: (index, signal) => (playback ? serverProxy.frames.getData(
                        this.jobID, index, ChunkQuality.COMPRESSED, false,
                        { signal, playbackQuality: 50, maxContentLength: encodedBytes },
                    ) : baseCache.getChunk(index, ChunkQuality.COMPRESSED, { signal, maxContentLength: encodedBytes })),
                });
            }
            try {
                const imageData = await baseCache.imageBuffer.frame(this.number, onServerRequest);
                return { renderWidth: this.width, renderHeight: this.height, imageData };
            } catch (error) {
                if (error?.name === 'AbortError') throw this.number;
                if (playback && [400, 404, 405].includes(error?.code)) {
                    baseCache.previewUnavailable = true;
                    return this.data(onServerRequest);
                }
                if (error instanceof RangeError || error?.code === 413) {
                    // A single chunk may exceed the byte budget. Do not retain or
                    // decode it wholesale: retrieve just the selected task-quality image.
                    return getIndividualFrame(this, onServerRequest, false);
                }
                throw error;
            }
        }
        const cacheKey = previewKey && !frameDataCache[this.jobID].previewUnavailable ?
            previewKey : String(this.jobID);
        const cache = frameDataCache[cacheKey];
        if (individualFrame && (cache.imageFrames || !cache.previewUnavailable)) {
            const bufferedImage = cache.imageFrames ?
                !cache.imageBufferPlayback && cache.imageBuffer?.cachedFrame(this.number) :
                cache.provider.frame(this.number);
            if (bufferedImage) return { renderWidth: this.width, renderHeight: this.height, imageData: bufferedImage };
            return getIndividualFrame(this, onServerRequest);
        }
        const {
            provider, chunkSize, jobStartFrame,
            decodeForward, forwardStep, decodedBlocksCacheSize, segmentFrameNumbers,
        } = cache;
        const meta = await cache.getMeta();

        return new Promise<{
            renderWidth: number;
            renderHeight: number;
            imageData: ImageBitmap | Blob;
        }>((resolve, reject) => {
            const requestId = +_.uniqueId();
            const requestedDataFrameNumber = meta.getDataFrameNumber(this.number - jobStartFrame);
            const chunkIndex = meta.getFrameChunkIndex(requestedDataFrameNumber);
            const frame = provider.frame(this.number);
            cache.latestFrameDecodeRequest = requestId;
            cache.currentChunkIndex = chunkIndex;

            function findTheNextNotDecodedChunk(currentFrameIndex: number): number | null {
                const { chunkCount } = meta;
                let nextFrameIndex = currentFrameIndex + forwardStep;
                let nextChunkIndex = Math.floor(nextFrameIndex / chunkSize);
                while (nextChunkIndex === chunkIndex) {
                    nextFrameIndex += forwardStep;
                    nextChunkIndex = Math.floor(nextFrameIndex / chunkSize);
                }

                if (nextChunkIndex < 0 || chunkCount <= nextChunkIndex) {
                    return null;
                }

                if (provider.isChunkCached(nextChunkIndex)) {
                    return findTheNextNotDecodedChunk(nextFrameIndex);
                }

                return nextChunkIndex;
            }

            const prefetch = (): void => {
                if (
                    decodedBlocksCacheSize > 1 && !cache.activeChunkRequest &&
                    frameDataCache[cacheKey] === cache && cache.latestFrameDecodeRequest === requestId &&
                    provider.isChunkCached(chunkIndex)
                ) {
                    const nextChunkIndex = findTheNextNotDecodedChunk(
                        meta.getFrameIndex(requestedDataFrameNumber),
                    );
                    const predecodeChunksMax = decodedBlocksCacheSize - 1;
                    if (nextChunkIndex !== null &&
                        Math.abs(nextChunkIndex - chunkIndex) <= predecodeChunksMax
                    ) {
                        cache.activeChunkRequest = new Promise((resolveForward) => {
                            const releasePromise = (): void => {
                                resolveForward();
                                cache.activeChunkRequest = null;
                            };

                            cache.getChunk(
                                nextChunkIndex, ChunkQuality.COMPRESSED,
                            ).then((chunk: ArrayBuffer) => {
                                if (frameDataCache[cacheKey] !== cache) {
                                    // The job may have been closed or reopened during the request.
                                    releasePromise();
                                    return;
                                }

                                const inLookAhead = (index: number): boolean => (
                                    (index - cache.currentChunkIndex) * cache.forwardStep >= 0 &&
                                    Math.abs(index - cache.currentChunkIndex) < decodedBlocksCacheSize
                                );
                                if (!inLookAhead(nextChunkIndex)) {
                                    // Navigation changed while downloading. Do not evict
                                    // useful frames to decode an obsolete speculative chunk.
                                    releasePromise();
                                    cache.prefetch();
                                    return;
                                }
                                // LRU alone would evict older prefetched future chunks
                                // before recently displayed (but now behind) chunks.
                                provider.cleanup(1, provider.cachedChunks().filter(inLookAhead));
                                provider.requestDecodeBlock(
                                    chunk,
                                    nextChunkIndex,
                                    segmentFrameNumbers.slice(
                                        nextChunkIndex * chunkSize,
                                        (nextChunkIndex + 1) * chunkSize,
                                    ),
                                    () => {},
                                    () => {
                                        releasePromise();
                                        // Fill the available look-ahead without requiring
                                        // playback or another navigation event. A seek or
                                        // job close invalidates this chain above.
                                        cache.prefetch();
                                    },
                                    releasePromise,
                                );
                            }).catch(() => {
                                releasePromise();
                            });
                        });
                    }
                }
            };
            cache.prefetch = prefetch;

            if (frame) {
                prefetch();
                const display = (): void => {
                    if (frameDataCache[cacheKey] !== cache) {
                        reject(this.number);
                        return;
                    }
                    resolve({
                        renderWidth: this.width,
                        renderHeight: this.height,
                        imageData: frame,
                    });
                };
                if (decodeForward && (cache.mode === 'interpolation' || previewKey) && !cache.playbackPrimed &&
                    cache.activeChunkRequest
                ) {
                    // Pay the bounded buffer cost before the first playback image,
                    // not when a speculative download completes mid-stream.
                    cache.playbackPrimed = true;
                    let timeout: ReturnType<typeof setTimeout>;
                    Promise.race([
                        cache.activeChunkRequest,
                        new Promise((done) => { timeout = setTimeout(done, 1000); }),
                    ]).finally(() => clearTimeout(timeout)).then(() => {
                        if (frameDataCache[cacheKey] === cache && decodedBlocksCacheSize > 2) prefetch();
                        display();
                    });
                } else {
                    display();
                }
                return;
            }

            onServerRequest();
            (cache.activeChunkRequest || Promise.resolve()).finally(() => {
                if (frameDataCache[cacheKey] !== cache || cache.latestFrameDecodeRequest !== requestId) {
                    // not relevant request anymore
                    reject(this.number);
                    return;
                }

                // it might appear during previous decoding, so, check again
                const currentFrame = provider.frame(this.number);
                if (currentFrame) {
                    resolve({
                        renderWidth: this.width,
                        renderHeight: this.height,
                        imageData: currentFrame,
                    });
                    prefetch();
                    return;
                }

                cache.activeChunkRequest = new Promise<void>((
                    resolveLoadAndDecode,
                ) => {
                    let wasResolved = false;
                    cache.getChunk(
                        chunkIndex, ChunkQuality.COMPRESSED,
                    ).then((chunk: ArrayBuffer) => {
                        try {
                            if (frameDataCache[cacheKey] !== cache) {
                                // check if frameDataCache still exist
                                // as it may be released during chunk request
                                resolveLoadAndDecode();
                                reject(this.number);
                                return;
                            }

                            provider
                                .requestDecodeBlock(
                                    chunk,
                                    chunkIndex,
                                    segmentFrameNumbers.slice(
                                        chunkIndex * chunkSize,
                                        (chunkIndex + 1) * chunkSize,
                                    ),
                                    (_frame: number, bitmap: ImageBitmap | Blob) => {
                                        if (decodeForward) {
                                            // resolve immediately only if is not playing
                                            return;
                                        }

                                        if (cache.latestFrameDecodeRequest === requestId &&
                                            this.number === _frame
                                        ) {
                                            wasResolved = true;
                                            resolve({
                                                renderWidth: this.width,
                                                renderHeight: this.height,
                                                imageData: bitmap,
                                            });
                                        }
                                    },
                                    () => {
                                        cache.activeChunkRequest = null;
                                        resolveLoadAndDecode();
                                        if (frameDataCache[cacheKey] !== cache) {
                                            reject(this.number);
                                            return;
                                        }
                                        const decodedFrame = provider.frame(this.number);
                                        // Start look-ahead on cold loads too. Otherwise a one-frame
                                        // chunk never produces a cache hit that could trigger it.
                                        if (cache.latestFrameDecodeRequest === requestId) {
                                            prefetch();
                                        }
                                        if (decodeForward) {
                                            // resolve after decoding everything if playing
                                            resolve({
                                                renderWidth: this.width,
                                                renderHeight: this.height,
                                                imageData: decodedFrame,
                                            });
                                        } else if (!wasResolved) {
                                            reject(this.number);
                                        }
                                    },
                                    (error: Error | RequestOutdatedError) => {
                                        cache.activeChunkRequest = null;
                                        resolveLoadAndDecode();
                                        if (error instanceof RequestOutdatedError) {
                                            reject(this.number);
                                        } else {
                                            reject(error);
                                        }
                                    },
                                );
                        } catch (error) {
                            reject(error);
                        }
                    }).catch((error) => {
                        reject(error);
                        cache.activeChunkRequest = null;
                        resolveLoadAndDecode(error);
                    });
                });
            });
        }).catch((error) => {
            if (previewKey && [400, 404, 405, 415].includes(error?.code) &&
                frameDataCache[this.jobID]
            ) {
                // Older servers do not implement previews. Keep their existing chunk path.
                frameDataCache[this.jobID].previewUnavailable = true;
                return this.data(onServerRequest);
            }
            throw error;
        });
    },
    writable: false,
});

function mergeMetaData(
    nextData: SerializedFramesMetaData,
    previousData?: Promise<FramesMetaData>,
): Promise<FramesMetaData> {
    const framesMetaData = new FramesMetaData({
        ...nextData,
        deleted_frames: Object.fromEntries(nextData.deleted_frames.map((_frame) => [_frame, true])),
    });

    if (previousData instanceof Promise) {
        return previousData.then((prevMeta) => {
            const updatedFields = prevMeta.getUpdated();
            if (updatedFields.deletedFrames) {
                for (const [frame, state] of Object.entries(updatedFields.deletedFrames)) {
                    if (state === DeletedFrameState.DELETED) {
                        framesMetaData.deletedFrames[frame] = true;
                    } else if (state === DeletedFrameState.RESTORED) {
                        delete framesMetaData.deletedFrames[frame];
                    }
                }
            }

            if (updatedFields.cloudStorageId) {
                framesMetaData.cloudStorageId = prevMeta.cloudStorageId;
            }

            return framesMetaData;
        });
    }

    return Promise.resolve(framesMetaData);
}

export function getJobFramesMetaSync(jobID: number): FramesMetaData {
    const cached = frameMetaCacheSync[jobID];
    if (!cached) {
        throw new Error('Frames meta cache was not initialized for this job');
    }
    return cached;
}

export function getFramesMeta(type: 'job' | 'task', id: number, forceReload = false): Promise<FramesMetaData> {
    if (type === 'task') {
        // we do not cache task meta currently. So, each new call will results to the server request
        return serverProxy.frames.getMeta('task', id).then((serialized) => (
            new FramesMetaData({
                ...serialized,
                deleted_frames: Object.fromEntries(serialized.deleted_frames.map((_frame) => [_frame, true])),
            })
        ));
    }

    if (!(id in frameMetaCache) || forceReload) {
        const previousCache = frameMetaCache[id];
        frameMetaCache[id] = new Promise((resolve, reject) => {
            serverProxy.frames.getMeta('job', id).then((serialized) => {
                // When we get new framesMetaData from server there can be some unsaved data
                // here we merge new meta data with cached one
                mergeMetaData(serialized, previousCache).then((mergedData) => {
                    resolve(mergedData);
                });
            }).catch((error: unknown) => {
                delete frameMetaCache[id];
                if (previousCache instanceof Promise) {
                    frameMetaCache[id] = previousCache;
                }
                reject(error);
            });
        });
    }

    return frameMetaCache[id];
}

function saveMeta(meta: FramesMetaData, session: 'job' | 'task', id: number): Promise<FramesMetaData> {
    const newMeta = new Promise<FramesMetaData>((resolve, reject) => {
        serverProxy.frames.saveMeta(session, id, {
            deleted_frames: Object.keys(meta.deletedFrames).map((frame) => +frame),
            cloud_storage_id: meta.cloudStorageId,
        }).then((serverMeta) => {
            const updatedMetaData = new FramesMetaData({
                ...serverMeta,
                deleted_frames: Object.fromEntries(serverMeta.deleted_frames.map((_frame) => [_frame, true])),
            });
            resolve(updatedMetaData);
        }).catch((error) => {
            if (session === 'job') {
                frameMetaCache[id] = Promise.resolve(meta);
            }
            reject(error);
        });
    });

    if (session === 'job') {
        frameMetaCache[id] = newMeta;
    }

    return newMeta;
}

async function refreshJobCacheIfOutdated(jobID: number): Promise<void> {
    const cached = frameDataCache[jobID];
    if (!cached) {
        throw new Error('Frames meta cache was not initialized for this job');
    }

    const isOutdated = (Date.now() - cached.metaFetchedTimestamp) > config.jobMetaDataReloadPeriod;

    if (isOutdated) {
        // get metadata again if outdated
        const prevMeta = await cached.getMeta();
        const meta = await getFramesMeta('job', jobID, true);
        if (new Date(meta.chunksUpdatedDate) > new Date(prevMeta.chunksUpdatedDate)) {
            // chunks were re-defined. Existing data not relevant anymore
            // currently we only re-write meta, remove all cached frames from provider and clear cached context images
            // other parameters (e.g. chunkSize) are not supposed to be changed
            cached.provider.cleanup(Number.MAX_SAFE_INTEGER);
            cached.refinementController?.abort();
            cached.imageBuffer?.close();
            cached.imageBuffer = undefined;
            cached.refinedImage?.close();
            cached.refinedImage = undefined;
            const previewKey = `${jobID}:preview`;
            frameDataCache[previewKey]?.provider.close();
            delete frameDataCache[previewKey];
            for (const frame of Object.keys(cached.contextCache)) {
                for (const image of Object.values(cached.contextCache[+frame].data)) {
                    // close images to immediate memory release
                    image.close();
                }
            }
            cached.contextCache = {};
        }

        cached.metaFetchedTimestamp = Date.now();
    }
}

export async function getContextImage(
    jobID: number,
    frame: number,
    getImageContext: (frame: number) => Promise<ArrayBuffer>,
): Promise<Record<string, ImageBitmap>> {
    if (!(jobID in frameDataCache)) {
        throw new Error(
            'Frame data was not initialized for this job. Try first requesting any frame.',
        );
    }

    const frameData = frameDataCache[jobID];
    const meta = await frameData.getMeta();
    const requestId = frame;
    const { jobStartFrame } = frameData;
    const dataFrameNumber = meta.getDataFrameNumber(frame - jobStartFrame);
    const frameIndex = meta.getFrameIndex(dataFrameNumber);
    const { related_files: relatedFiles } = meta.frames[frameIndex];
    return new Promise<Record<string, ImageBitmap>>((resolve, reject) => {
        if (relatedFiles === 0) {
            resolve({});
        } else if (frame in frameData.contextCache) {
            resolve(frameData.contextCache[frame].data);
        } else {
            frameData.latestContextImagesRequest = requestId;
            const executor = (): void => {
                if (frameData.latestContextImagesRequest !== requestId) {
                    reject(frame);
                } else if (frame in frameData.contextCache) {
                    resolve(frameData.contextCache[frame].data);
                } else {
                    frameData.activeContextRequest = getImageContext(frame)
                        .then((encodedImages) => decodeContextImages(encodedImages, 0, relatedFiles));
                    frameData.activeContextRequest.then((images) => {
                        const size = Object.values(images)
                            .reduce((acc, image) => acc + image.width * image.height * 4, 0);
                        const totalSize = Object.values(frameData.contextCache)
                            .reduce((acc, item) => acc + item.size, 0);
                        if (totalSize > 512 * 1024 * 1024) {
                            const [leastTimestampFrame] = Object.entries(frameData.contextCache)
                                .sort(([, item1], [, item2]) => item1.timestamp - item2.timestamp)[0];
                            delete frameData.contextCache[leastTimestampFrame];
                        }

                        frameData.contextCache[frame] = {
                            data: images,
                            timestamp: Date.now(),
                            size,
                        };

                        if (frameData.latestContextImagesRequest !== requestId) {
                            reject(frame);
                        } else {
                            resolve(images);
                        }
                    }).finally(() => {
                        frameData.activeContextRequest = null;
                    });
                }
            };

            if (!frameData.activeContextRequest) {
                executor();
            } else {
                const checkAndExecute = (): void => {
                    if (frameData.activeContextRequest) {
                        // if we just execute in finally
                        // it might raise multiple server requests for context images
                        // if the promise was pending before and several requests came for the same frame
                        // all these requests will stuck on "finally"
                        // and when the promise is fulfilled, it will run all the microtasks
                        // since they all have the same request id, all they will perform in executor()
                        frameData.activeContextRequest.finally(() => setTimeout(checkAndExecute));
                    } else {
                        executor();
                    }
                };

                setTimeout(checkAndExecute);
            }
        }
    });
}

export function decodePreview(preview: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result as string);
        };
        reader.onerror = (error) => {
            reject(error);
        };
        reader.readAsDataURL(preview);
    });
}

export async function resolvePreviewResponse(
    response: PreviewResponse,
    mediaType?: MediaType,
): Promise<string> {
    if (response === PREVIEW_DEFAULT) {
        return (mediaType && config.previewPlaceholders[mediaType]) || '';
    }

    if (response) {
        return decodePreview(response);
    }

    return '';
}

export async function getFrame(
    jobID: number,
    chunkSize: number,
    chunkType: 'video' | 'imageset',
    mode: 'interpolation' | 'annotation', // todo: obsolete, need to remove
    frame: number,
    jobStartFrame: number,
    isPlaying: boolean,
    step: number,
    dimension: DimensionType,
    getChunk: (chunkIndex: number, quality: ChunkQuality, options?: FrameChunkRequestOptions) => Promise<ArrayBuffer>,
): Promise<FrameData> {
    const dataCacheExists = jobID in frameDataCache;
    const previewEligible = chunkType === 'imageset' && dimension === DimensionType.DIMENSION_2D;

    if (!dataCacheExists) {
        const blockType = chunkType === 'video' ? BlockType.MP4VIDEO : BlockType.ARCHIVE;
        const meta = await getFramesMeta('job', jobID);

        const mean = meta.frames.reduce((a, b) => a + b.width * b.height, 0) / meta.frames.length;
        const stdDev = Math.sqrt(
            meta.frames.map((x) => (x.width * x.height - mean) ** 2).reduce((a, b) => a + b) /
            meta.frames.length,
        );

        // Scale look-ahead at normal task quality using this client's setting.
        // Preview frames have a separate budget, so they cannot reduce this window.
        const decodedBlocksCacheSize = Math.min(
            Math.floor((2048 * config.frameBufferMultiplier * 1024 * 1024) /
                ((mean + stdDev) * 4 * chunkSize)) || 1, 10 * config.frameBufferMultiplier,
        );

        const dataFrameNumberGetter = (frameNumber: number): number => (
            meta.getDataFrameNumber(frameNumber - jobStartFrame)
        );

        frameDataCache[jobID] = {
            metaFetchedTimestamp: Date.now(),
            chunkSize,
            mode,
            jobStartFrame,
            segmentFrameNumbers: meta.getSegmentFrameNumbers(jobStartFrame),
            decodeForward: isPlaying,
            forwardStep: step,
            provider: new FrameDecoder(
                blockType,
                decodedBlocksCacheSize,
                (frameNumber: number): number => (
                    meta.getFrameChunkIndex(dataFrameNumberGetter(frameNumber))
                ),
                dimension,
            ),
            decodedBlocksCacheSize,
            frameBufferMultiplier: config.frameBufferMultiplier,
            currentChunkIndex: 0,
            prefetch: () => {},
            activeChunkRequest: null,
            activeContextRequest: null,
            latestFrameDecodeRequest: null,
            latestContextImagesRequest: null,
            contextCache: {},
            imageFrames: previewEligible,
            getChunk,
            getMeta: () => {
                const cached = frameMetaCache[jobID];
                if (!(cached instanceof Promise)) {
                    throw new Error('Frame meta data is not initialized');
                }
                return cached;
            },
        };
    }

    // basically the following functions may be affected if job cache is outdated
    // - getFrame
    // - getContextImage
    // - getCachedChunks
    // And from this idea we should call refreshJobCacheIfOutdated from each one
    // However, following from the order, these methods are usually called
    // it may lead to even more confusing behaviour
    //
    // Usually user first receives frame, then user receives ranges and finally user receives context images
    // In this case (extremely rare, but nevertheless possible) user may get context images related to another frame
    // - if cache gets outdated after getFrame() call
    // - and before getContextImage() call
    // - and both calls refer to the same frame that is refreshed honeypot frame and this frame has context images
    // Thus, it is better to only call `refreshJobCacheIfOutdated` from getFrame()
    await refreshJobCacheIfOutdated(jobID);

    const framesMetaData = await frameDataCache[jobID].getMeta();
    const dataFrameNumber = framesMetaData.getDataFrameNumber(frame - jobStartFrame);
    const frameIndex = framesMetaData.getFrameIndex(dataFrameNumber);
    const frameMeta = framesMetaData.frames[frameIndex];
    frameDataCache[jobID].provider.setRenderSize(frameMeta.width, frameMeta.height);
    frameDataCache[jobID].decodeForward = isPlaying;
    frameDataCache[jobID].forwardStep = step;

    const meta = await frameDataCache[jobID].getMeta();

    return new FrameData({
        width: frameMeta.width,
        height: frameMeta.height,
        name: frameMeta.name,
        related_files: frameMeta.related_files,
        frameNumber: frame,
        deleted: frame in meta.deletedFrames,
        jobID,
        previewKey: previewEligible ? String(jobID) : null,
    });
}

export async function deleteFrame(jobID: number, frame: number): Promise<void> {
    const meta = await frameMetaCache[jobID];
    meta.deletedFrames[frame] = true;
}

export async function restoreFrame(jobID: number, frame: number): Promise<void> {
    const meta = await frameMetaCache[jobID];
    delete meta.deletedFrames[frame];
}

export async function patchMeta(id: number, meta?: FramesMetaData, session: 'job' | 'task' = 'job'): Promise<FramesMetaData> {
    const oldMeta = (session === 'job' ? await frameMetaCache[id] : meta);
    const updatedFields = oldMeta.getUpdated();
    if (Object.keys(updatedFields).length) {
        const newMeta = await saveMeta(oldMeta, session, id);
        return session === 'job' ? frameMetaCache[id] : newMeta;
    }
    return oldMeta;
}

export async function findFrame(
    jobID: number,
    frameFrom: number,
    frameTo: number,
    filters: { offset?: number, notDeleted: boolean, chapterMark?: boolean },
): Promise<number | null> {
    const offset = filters.offset || 1;
    const chapterMark = filters.chapterMark || false;
    const meta = await getFramesMeta('job', jobID);

    const sign = Math.sign(frameTo - frameFrom);
    const predicate = sign > 0 ? (frame) => frame <= frameTo : (frame) => frame >= frameTo;
    const update = sign > 0 ? (frame) => frame + 1 : (frame) => frame - 1;
    let framesCounter = 0;
    let lastUndeletedFrame = null;
    const check = (frame): boolean => {
        if (meta.includedFrames) {
            // meta.includedFrames contains absolute frame numbers
            const jobStartFrame = 0; // this is only true when includedFrames is set
            return (
                meta.includedFrames.includes(meta.getDataFrameNumber(frame - jobStartFrame))
            ) && (!filters.notDeleted || !(frame in meta.deletedFrames));
        }

        if (filters.notDeleted) {
            return !(frame in meta.deletedFrames);
        }

        if (chapterMark) {
            return meta.chapters.some((chapter) => chapter.start === frame);
        }

        return true;
    };
    for (let frame = frameFrom; predicate(frame); frame = update(frame)) {
        if (check(frame)) {
            lastUndeletedFrame = frame;
            framesCounter++;
            if (framesCounter === offset) {
                return lastUndeletedFrame;
            }
        }
    }

    return lastUndeletedFrame;
}

export function getCachedChunks(jobID: number): number[] {
    if (!(jobID in frameDataCache)) {
        return [];
    }

    return frameDataCache[jobID].imageBuffer?.cachedChunks() || frameDataCache[jobID].provider.cachedChunks(true);
}

export async function getJobFrameNumbers(jobID: number): Promise<number[]> {
    if (!(jobID in frameDataCache)) {
        return [];
    }

    const { segmentFrameNumbers } = frameDataCache[jobID];
    return segmentFrameNumbers.slice(0);
}

export function clear(jobID: number): void {
    const previewKey = `${jobID}:preview`;
    frameDataCache[previewKey]?.provider.close();
    delete frameDataCache[previewKey];
    if (jobID in frameDataCache) {
        frameDataCache[jobID].refinementController?.abort();
        frameDataCache[jobID].imageBuffer?.close();
        frameDataCache[jobID].refinedImage?.close();
        frameDataCache[jobID].provider.close();
        for (const contextImagesByFrame of Object.values(frameDataCache[jobID].contextCache)) {
            for (const image of Object.values(contextImagesByFrame.data)) {
                image.close();
            }
        }

        delete frameDataCache[jobID];
    }

    if (jobID in frameMetaCache) {
        delete frameMetaCache[jobID];
    }
}
