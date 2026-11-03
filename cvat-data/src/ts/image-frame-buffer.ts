// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

interface ImageBufferOptions {
    frames: number[];
    chunkSize: number;
    chunkLimit: number;
    encodedBytes: number;
    decodedBytes: number;
    getChunk: (index: number, signal: AbortSignal) => Promise<ArrayBuffer>;
}

// Network lookaround and decoded image lifetimes are deliberately separate.
// A long compressed window must not allocate that window as RGBA bitmaps.
export default class ImageFrameBuffer {
    private readonly options: ImageBufferOptions;
    private readonly positions: Map<number, number>;
    private readonly encoded = new Map<number, number>();
    private readonly decoded = new Map<number, ImageBitmap>();
    private readonly downloads = new Map<number, {
        controller: AbortController;
        promise: Promise<void>;
    }>();
    private readonly oversized = new Set<number>();
    private readonly worker: Worker;
    private readonly requests = new Map<number, {
        resolve:(bitmap?: ImageBitmap) => void;
        reject: (error: Error) => void;
    }>();
    private readonly decoding = new Map<number, Promise<ImageBitmap>>();
    private requestID = 0;
    private current: number | null = null;
    private direction = 1;
    private generation = 0;
    private active = false;
    private closed = false;
    private filling = false;
    private warming = false;

    constructor(options: ImageBufferOptions) {
        this.options = options;
        this.positions = new Map(options.frames.map((frame, index) => [frame, index]));
        this.worker = new Worker(new URL('./image-buffer.worker', import.meta.url));
        this.worker.onmessage = ({ data }) => {
            const request = this.requests.get(data.id);
            this.requests.delete(data.id);
            if (!request) {
                data.bitmap?.close();
            } else if (data.error) {
                request.reject(new Error(data.error));
            } else {
                request.resolve(data.bitmap);
            }
        };
        this.worker.onerror = (event) => {
            for (const request of this.requests.values()) request.reject(new Error(event.message));
            this.requests.clear();
        };
    }

    private send(message: object, transfer: Transferable[] = []): Promise<ImageBitmap | undefined> {
        return new Promise((resolve, reject) => {
            const id = this.requestID++;
            this.requests.set(id, { resolve, reject });
            this.worker.postMessage({ ...message, id }, transfer);
        });
    }

    private get currentChunk(): number {
        return Math.floor(this.positions.get(this.current) / this.options.chunkSize);
    }

    private window(): number[] {
        const count = Math.ceil(this.options.frames.length / this.options.chunkSize);
        const capacity = Math.min(count, this.options.chunkLimit);
        const start = Math.max(0, Math.min(count - capacity, this.currentChunk - Math.floor((capacity - 1) / 2)));
        return Array.from({ length: capacity }, (_, offset) => start + offset).sort((a, b) => (
            Math.abs(a - this.currentChunk) - Math.abs(b - this.currentChunk) ||
            (b - a) * this.direction
        ));
    }

    private trim(): void {
        const order = this.window();
        let bytes = [...this.encoded.values()].reduce((total, size) => total + size, 0);
        const remove = (chunk: number): void => {
            bytes -= this.encoded.get(chunk);
            this.encoded.delete(chunk);
            this.worker.postMessage({ action: 'delete', chunk });
        };
        for (const chunk of this.encoded.keys()) {
            if (!order.includes(chunk)) remove(chunk);
        }
        for (const chunk of [...order].reverse()) {
            if (bytes <= this.options.encodedBytes && this.encoded.size <= this.options.chunkLimit) break;
            if (chunk !== this.currentChunk && this.encoded.has(chunk)) remove(chunk);
        }
    }

    private async download(chunk: number): Promise<void> {
        if (this.closed) throw new DOMException('Image buffer closed', 'AbortError');
        if (this.encoded.has(chunk)) return;
        if (this.oversized.has(chunk)) throw new RangeError('Image chunk exceeds the compressed buffer budget');
        const pending = this.downloads.get(chunk);
        if (pending) {
            await (pending.controller.signal.aborted ?
                pending.promise.catch(() => this.download(chunk)) : pending.promise);
            return;
        }
        const controller = new AbortController();
        const promise = Promise.resolve().then(async () => {
            const block = await this.options.getChunk(chunk, controller.signal);
            if (controller.signal.aborted || this.closed) throw new DOMException('Image request cancelled', 'AbortError');
            const size = block.byteLength;
            if (size > this.options.encodedBytes) {
                this.oversized.add(chunk);
                throw new RangeError('Image chunk exceeds the compressed buffer budget');
            }
            await this.send({ action: 'store', chunk, block }, [block]);
            if (this.closed) throw new DOMException('Image buffer closed', 'AbortError');
            this.encoded.set(chunk, size);
            this.trim();
        }).catch((error) => {
            if (error?.code === 413) this.oversized.add(chunk);
            throw error;
        }).finally(() => {
            if (this.downloads.get(chunk)?.controller === controller) this.downloads.delete(chunk);
        });
        this.downloads.set(chunk, { controller, promise });
        await promise;
    }

    private async fill(): Promise<void> {
        if (this.filling || !this.active || this.closed) return;
        this.filling = true;
        const { generation } = this;
        try {
            while (this.active && !this.closed) {
                const order = this.window();
                // Two transfers overlap generation with delivery without starting
                // an unbounded queue of speculative work on the server. Reuse
                // either slot as soon as it finishes, even if the other is slow.
                const next = order.filter((chunk) => (
                    !this.encoded.has(chunk) && !this.oversized.has(chunk) && !this.downloads.has(chunk)
                )).slice(0, Math.max(0, 2 - this.downloads.size));
                const bytes = [...this.encoded.values()].reduce((total, size) => total + size, 0);
                // Do not repeatedly download an outer chunk that cannot fit. A
                // newly selected/nearer chunk may still replace a distant one.
                const average = bytes / (this.encoded.size || 1);
                const farthest = Math.max(...[...this.encoded.keys()].map((chunk) => order.indexOf(chunk)));
                while (next.length && bytes + average * next.length > this.options.encodedBytes &&
                    order.indexOf(next[next.length - 1]) > farthest) next.pop();
                const pending = [...this.downloads].map(([chunk, { promise }]) => promise.then(() => chunk));
                pending.push(...next.map((chunk) => this.download(chunk).then(() => chunk)));
                if (!pending.length) break;
                const completed = await Promise.race(pending);
                this.warmNext();
                if (!this.encoded.has(completed)) break;
            }
        } catch {
            // Speculation is optional. The next foreground read can retry it.
        } finally {
            this.filling = false;
            if (this.active && generation !== this.generation) this.fill();
        }
    }

    cachedFrame(number: number): ImageBitmap | null {
        const bitmap = this.decoded.get(number);
        if (!bitmap) return null;
        this.decoded.delete(number);
        this.decoded.set(number, bitmap);
        return bitmap;
    }

    private decode(number: number): Promise<ImageBitmap> {
        const pending = this.decoding.get(number);
        if (pending) return pending;
        const decoding = (async (): Promise<ImageBitmap> => {
            const position = this.positions.get(number);
            const chunk = Math.floor(position / this.options.chunkSize);
            await this.download(chunk);
            if (this.closed) throw new DOMException('Image buffer closed', 'AbortError');
            const bitmap = await this.send({ action: 'decode', chunk, offset: position % this.options.chunkSize });
            const currentBitmap = this.decoded.get(this.current);
            const bytes = bitmap.width * bitmap.height * 4;
            const currentBytes = currentBitmap ? currentBitmap.width * currentBitmap.height * 4 : 0;
            if (this.closed || Math.abs(position - this.positions.get(this.current)) > 1 ||
                (number !== this.current && bytes + currentBytes > this.options.decodedBytes)) {
                bitmap.close();
                throw new DOMException('Image request superseded', 'AbortError');
            }
            this.decoded.set(number, bitmap);
            let retained = [...this.decoded.values()].reduce((
                total, image,
            ) => total + image.width * image.height * 4, 0);
            for (const [frame, image] of this.decoded) {
                if (retained <= this.options.decodedBytes && this.decoded.size <= 6) break;
                if (frame === this.current) continue;
                retained -= image.width * image.height * 4;
                image.close();
                this.decoded.delete(frame);
            }
            return bitmap;
        })().finally(() => this.decoding.delete(number));
        this.decoding.set(number, decoding);
        return decoding;
    }

    private warmNext(): void {
        if (this.warming || !this.active || this.closed) return;
        const current = this.decoded.get(this.current);
        // One adjacent decode overlaps annotation/render work, not a whole ZIP.
        // Do not speculate when even two current-sized images exceed the budget.
        if (!current || current.width * current.height * 8 > this.options.decodedBytes) return;
        const position = this.positions.get(this.current) + this.direction;
        const number = this.options.frames[position];
        if (number === undefined || this.decoded.has(number) ||
            !this.encoded.has(Math.floor(position / this.options.chunkSize))) return;
        const selected = this.current;
        this.warming = true;
        this.decode(number).catch(() => {}).finally(() => {
            this.warming = false;
            if (this.current !== selected) this.warmNext();
        });
    }

    async frame(number: number, onRequest: () => void = () => {}): Promise<ImageBitmap> {
        if (this.closed) throw new DOMException('Image buffer closed', 'AbortError');
        if (!this.positions.has(number)) throw new Error('Frame does not belong to this image buffer');
        if (this.current !== null && this.current !== number) this.direction = Math.sign(number - this.current);
        if (this.current !== number || !this.active) this.generation++;
        this.current = number;
        this.active = true;
        this.trim();
        // A selected frame has priority over speculative network work. Keep a
        // useful pending download when the selected chunk is already available.
        for (const [chunk, pending] of this.downloads) {
            if (chunk !== this.currentChunk &&
                (!this.encoded.has(this.currentChunk) || !this.window().includes(chunk))) pending.controller.abort();
        }
        const { generation } = this;
        const cached = this.cachedFrame(number);
        if (cached) {
            this.fill();
            this.warmNext();
            return cached;
        }
        if (!this.encoded.has(this.currentChunk)) onRequest();
        const bitmap = await this.decode(number);
        if (this.closed || this.current !== number || generation !== this.generation) {
            throw new DOMException('Image request superseded', 'AbortError');
        }
        this.fill();
        this.warmNext();
        return bitmap;
    }

    cachedChunks(): number[] {
        return [...this.encoded.keys()].sort((a, b) => a - b);
    }

    pause(): void {
        this.active = false;
        this.generation++;
        for (const pending of this.downloads.values()) pending.controller.abort();
    }

    close(): void {
        this.pause();
        this.closed = true;
        this.worker.terminate();
        for (const request of this.requests.values()) request.reject(new DOMException('Image buffer closed', 'AbortError'));
        this.requests.clear();
        for (const bitmap of this.decoded.values()) bitmap.close();
        this.decoded.clear();
        this.encoded.clear();
    }
}
