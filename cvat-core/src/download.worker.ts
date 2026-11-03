// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/* eslint-disable no-restricted-globals */

// Progress-making attempts reset this counter; it limits repeated failures that do not add bytes.
const MAX_NO_PROGRESS_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60000;
const MIN_CHUNK_SIZE_FOR_TELEMETRY_BYTES = 2 * 1024 * 1024;

class DownloadError extends Error {
    public code: number;

    constructor(message: string, code: number) {
        super(message);
        this.code = code;
    }
}

class DownloadReadError extends Error {
    public receivedBytes: number;
    public downloadTimeMs: number;

    constructor(message: string, receivedBytes: number, downloadTimeMs: number) {
        super(message);
        this.receivedBytes = receivedBytes;
        this.downloadTimeMs = downloadTimeMs;
    }
}

interface ChunkIdentity {
    checksum: string;
    updatedDate: string;
}

interface DownloadTelemetry {
    chunkSizeBytes: number;
    downloadTimeMs: number;
    retries: number;
}

function sleep(timeout: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const abort = (): void => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            reject(new DOMException('Download cancelled', 'AbortError'));
        };
        timer = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve();
        }, timeout);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
    });
}

function parseRetryAfter(retryAfter: string | null): number | null {
    if (!retryAfter || !/^\d+$/.test(retryAfter)) {
        return null;
    }

    return Number(retryAfter) * 1000;
}

function getRetryDelay(response: Response | null, retry: number): number {
    const retryAfter = parseRetryAfter(response?.headers.get('retry-after') ?? null);
    if (retryAfter !== null) {
        return retryAfter;
    }

    return Math.min(BASE_RETRY_DELAY_MS * 2 ** retry, MAX_RETRY_DELAY_MS);
}

function shouldRetry(response: Response | null): boolean {
    const retryableStatuses = [
        429, // Too Many Requests: request is throttled, retry is allowed, Retry-After is provided.
        502, // Bad Gateway: Traefik -> Nginx -> Uvicorn (restarting, deployed on wrong port, etc.).
        503, // Service Unavailable: Traefik -> Nginx (No server pods listening (during deployment or bad config)).
        504, // Gateway Timeout: Traefik -> Nginx -> Uvicorn (Server is overloaded and cant produce response in time).
    ];

    return !response || retryableStatuses.includes(response.status);
}

function appendParams(url: string, params: Record<string, string | number | boolean>): string {
    const result = new URL(url, self.location.origin);
    for (const [key, value] of Object.entries(params || {})) {
        result.searchParams.set(key, `${value}`);
    }

    return result.toString();
}

function parseContentRange(value: string | null): { start: number; total: number | null } | null {
    if (!value) {
        return null;
    }

    const matched = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value);
    if (!matched) {
        return null;
    }

    return {
        start: +matched[1],
        total: matched[3] === '*' ? null : +matched[3],
    };
}

function getChunkSize(headers: Record<string, string>): number | null {
    const value = headers['x-chunk-size'];
    if (value === undefined) {
        return null;
    }

    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error('Unexpected X-Chunk-Size header');
    }

    return Number(value);
}

function headersToObject(headers: Headers): Record<string, string> {
    return Object.fromEntries([...headers.entries()]);
}

function getChunkIdentity(headers: Record<string, string>): ChunkIdentity {
    // The update date identifies the chunk generation, while the checksum also guards against stale cached content.
    const checksum = headers['x-checksum'];
    const updatedDate = headers['x-updated-date'];
    if (!checksum || !updatedDate) {
        throw new Error('Missing chunk identity headers');
    }

    return { checksum, updatedDate };
}

function isSameChunk(first: ChunkIdentity, second: ChunkIdentity): boolean {
    return first.checksum === second.checksum && first.updatedDate === second.updatedDate;
}

function mergeChunks(chunks: Uint8Array[], totalLength: number): ArrayBuffer {
    const data = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return data.buffer;
}

async function readResponse(
    response: Response,
    chunks: Uint8Array[],
    receivedBytes: number,
    maxContentLength: number,
): Promise<{ receivedBytes: number; downloadTimeMs: number }> {
    // fetch() has already resolved, so this timer excludes server-side chunk preparation.
    const downloadStartedAt = performance.now();
    const reader = response.body.getReader();
    let nextReceivedBytes = receivedBytes;

    while (true) {
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
            result = await reader.read();
        } catch (error) {
            throw new DownloadReadError(
                error instanceof Error ? error.message : `${error}`,
                nextReceivedBytes,
                performance.now() - downloadStartedAt,
            );
        }

        const { done, value } = result;
        if (done) {
            return {
                receivedBytes: nextReceivedBytes,
                downloadTimeMs: performance.now() - downloadStartedAt,
            };
        }

        nextReceivedBytes += value.byteLength;
        if (nextReceivedBytes > maxContentLength) {
            await reader.cancel();
            throw new DownloadError('Image chunk exceeds the compressed buffer budget', 413);
        }
        chunks.push(value);
    }
}

async function fetchData(url: string, requestConfig, signal: AbortSignal): Promise<{
    data: ArrayBuffer;
    headers: Record<string, string>;
    telemetry?: DownloadTelemetry;
}> {
    const requestUrl = appendParams(url, requestConfig.params);
    let chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    let expectedSize: number | null = null;
    let chunkIdentity: ChunkIdentity | null = null;
    let requestCount = 0;
    let bodyDownloadTimeMs = 0;

    let retry = 0;
    while (retry <= MAX_NO_PROGRESS_RETRIES) {
        const rangeRequested = receivedBytes > 0;
        let response: Response | null = null;
        let receivedBytesBeforeRequest = receivedBytes;

        requestCount++;
        try {
            const headers = new Headers(requestConfig.headers ?? {});
            if (rangeRequested) {
                headers.set('Range', `bytes=${receivedBytes}-`);
            }

            response = await fetch(requestUrl, {
                method: 'GET', credentials: 'include', headers, signal,
            });
            if (!response.ok) {
                if (retry < MAX_NO_PROGRESS_RETRIES && shouldRetry(response)) {
                    await sleep(getRetryDelay(response, retry), signal);
                    retry++;
                    continue;
                }

                throw new DownloadError(await response.text(), response.status);
            }

            const responseHeaders = headersToObject(response.headers);
            const responseIdentity = getChunkIdentity(responseHeaders);
            let responseSize = getChunkSize(responseHeaders);

            if (response.status === 206 && rangeRequested) {
                const contentRange = parseContentRange(responseHeaders['content-range'] ?? null);
                if (!contentRange || contentRange.start !== receivedBytes) {
                    throw new Error('Unexpected Content-Range header');
                }

                responseSize ??= contentRange.total;
                if (chunkIdentity && !isSameChunk(chunkIdentity, responseIdentity)) {
                    // Start a new download immediately because partial data, retries,
                    // and timing belong to an old chunk.
                    await response.body?.cancel();
                    return fetchData(url, requestConfig, signal);
                }
            } else if (response.status === 200) {
                if (rangeRequested) {
                    // Range was ignored: this representation starts at byte zero, not at our offset.
                    chunks = [];
                    receivedBytes = 0;
                    receivedBytesBeforeRequest = 0;
                    expectedSize = null;
                }
            } else {
                throw new Error(`Unexpected response status: ${response.status}`);
            }

            chunkIdentity = responseIdentity;
            expectedSize = responseSize ?? expectedSize;

            const maxContentLength = requestConfig.maxContentLength ?? Infinity;
            if (expectedSize !== null && expectedSize > maxContentLength) {
                await response.body?.cancel();
                throw new DownloadError('Image chunk exceeds the compressed buffer budget', 413);
            }
            const readResult = await readResponse(response, chunks, receivedBytes, maxContentLength);
            receivedBytes = readResult.receivedBytes;
            bodyDownloadTimeMs += readResult.downloadTimeMs;

            if (expectedSize !== null && receivedBytes > expectedSize) {
                throw new Error(`Received more bytes than expected: ${receivedBytes}/${expectedSize}`);
            }

            if (expectedSize !== null && receivedBytes < expectedSize) {
                if (receivedBytes > receivedBytesBeforeRequest) {
                    retry = 0;
                    await sleep(getRetryDelay(response, retry), signal);
                    continue;
                }

                if (retry < MAX_NO_PROGRESS_RETRIES) {
                    await sleep(getRetryDelay(response, retry), signal);
                    retry++;
                    continue;
                }

                throw new Error(`Received fewer bytes than expected: ${receivedBytes}/${expectedSize}`);
            }

            if (expectedSize === null || receivedBytes === expectedSize) {
                const telemetry = receivedBytes >= MIN_CHUNK_SIZE_FOR_TELEMETRY_BYTES ? {
                    chunkSizeBytes: receivedBytes,
                    // Includes body reading across resumed and restarted requests.
                    downloadTimeMs: bodyDownloadTimeMs,
                    retries: requestCount - 1,
                } : undefined;

                return {
                    data: mergeChunks(chunks, receivedBytes),
                    headers: {
                        ...responseHeaders,
                        'content-length': `${receivedBytes}`,
                    },
                    telemetry,
                };
            }
        } catch (error) {
            if (signal.aborted) throw new DOMException('Download cancelled', 'AbortError');
            if (error instanceof DownloadReadError) {
                receivedBytes = error.receivedBytes;
                // The partial bytes remain available for resuming, so include the time spent downloading them.
                bodyDownloadTimeMs += error.downloadTimeMs;
            }

            if (retry < MAX_NO_PROGRESS_RETRIES && (error instanceof DownloadReadError || shouldRetry(response))) {
                const madeProgress = receivedBytes > receivedBytesBeforeRequest;
                await sleep(getRetryDelay(response, madeProgress ? 0 : retry), signal);
                if (madeProgress) {
                    retry = 0;
                } else {
                    retry++;
                }
                continue;
            }

            throw error;
        }
    }

    throw new Error('Maximum download retries without progress exceeded');
}

const controllers = new Map<number, AbortController>();

onmessage = (e) => {
    if (e.data.action === 'abort') {
        controllers.get(e.data.id)?.abort();
        return;
    }
    const controller = new AbortController();
    controllers.set(e.data.id, controller);
    fetchData(e.data.url, e.data.config, controller.signal)
        .then((response) => {
            postMessage({
                responseData: response.data,
                headers: response.headers,
                telemetry: response.telemetry,
                id: e.data.id,
                isSuccess: true,
            }, { transfer: [response.data] });
        })
        .catch((error) => {
            const message = {
                id: e.data.id,
                message: error.message,
                isSuccess: false,
                ...(typeof error.code === 'number' ? { code: error.code } : {}),
            };

            postMessage(message);
        }).finally(() => controllers.delete(e.data.id));
};
