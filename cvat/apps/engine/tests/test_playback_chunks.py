# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import io
import zipfile
from datetime import timedelta
from unittest import mock

from django.test import SimpleTestCase
from django.utils import timezone
from PIL import Image
from rest_framework.exceptions import ValidationError

from cvat.apps.engine import models
from cvat.apps.engine.cache import MediaCache, _PlaybackChunkWriter
from cvat.apps.engine.media_extractors import ZipCompressedChunkWriter
from cvat.apps.engine.media_io.frame_provider import JobFrameProvider
from cvat.apps.engine.media_io.media_provider import DataWithMeta
from cvat.apps.engine.views import _JobDataGetter


class TestPlaybackChunks(SimpleTestCase):
    def setUp(self):
        self.data = models.Data(
            chunk_size=3,
            size=9,
            start_frame=10,
            stop_frame=26,
            frame_filter="step=2",
            image_quality=90,
            compressed_chunk_type=models.DataChoice.IMAGESET,
            original_chunk_type=models.DataChoice.IMAGESET,
            storage_method=models.StorageMethodChoice.CACHE,
        )
        self.task = models.Task(
            data=self.data,
            dimension=models.DimensionType.DIM_2D,
            media_type=models.MediaType.IMAGE,
            mode=models.TaskMode.ANNOTATION,
        )
        self.segment = models.Segment(
            task=self.task, start_frame=2, stop_frame=6, chunks_updated_date=timezone.now()
        )
        self.job = models.Job(id=123, segment=self.segment)
        self.cache = MediaCache()

    def _raw_frames(self, task, frame_ids):
        self.assertIs(task, self.task)
        for frame_id in frame_ids:
            image = Image.new("RGB", (1024, 512), (frame_id * 5, 20, 30))
            if frame_id == 14:
                image = Image.new("RGB", (120, 80), (70, 20, 30))
                image.getexif()[274] = 6
            try:
                yield image, f"{frame_id}.jpeg"
            finally:
                image.close()

    def _read_chunk(self, data):
        with zipfile.ZipFile(data) as chunk:
            names = chunk.namelist()
            self.assertEqual(names, [f"{i:06d}.jpeg" for i in range(len(names))])
            result = []
            for name in names:
                with Image.open(chunk.open(name)) as image:
                    self.assertEqual(image.format, "JPEG")
                    result.append((image.size, image.getpixel((0, 0)), image.quantization))
            return result

    def test_cold_chunk_uses_source_iterator_once_at_requested_quality(self):
        for quality in (10, 50, 90):
            with (
                self.subTest(quality=quality),
                mock.patch.object(
                    MediaCache, "_read_raw_frames", side_effect=self._raw_frames
                ) as raw,
                mock.patch.object(JobFrameProvider, "get_chunk", side_effect=AssertionError),
            ):
                data, mime = self.cache.prepare_job_playback_chunk(
                    self.job, 0, image_quality=quality
                )
                self.assertEqual(mime, "application/zip")
                raw.assert_called_once_with(self.task, frame_ids=[14, 16, 18])
                frames = self._read_chunk(data)
                self.assertEqual([f[0] for f in frames], [(80, 120), (1024, 512), (1024, 512)])
                for frame, frame_id in zip(frames, (14, 16, 18)):
                    # Compare against the requested lossy encoding, not source RGB:
                    # at quality 10 a valid JPEG can differ noticeably from RGB.
                    expected = io.BytesIO()
                    Image.new("RGB", frame[0], (frame_id * 5, 20, 30)).save(
                        expected, format="JPEG", quality=quality, optimize=True
                    )
                    with Image.open(expected) as image:
                        self.assertEqual(frame[1], image.getpixel((0, 0)))
                reference = io.BytesIO()
                Image.new("RGB", (1, 1)).save(reference, format="JPEG", quality=quality)
                with Image.open(reference) as image:
                    self.assertTrue(all(f[2] == image.quantization for f in frames))
        self.assertEqual(self.data.image_quality, 90)

    def test_legacy_number_intersects_task_chunk_with_job(self):
        with mock.patch.object(MediaCache, "_read_raw_frames", side_effect=self._raw_frames) as raw:
            data, _ = self.cache.prepare_job_playback_chunk(self.job, 1, is_task_chunk=True)
            raw.assert_called_once_with(self.task, frame_ids=[16, 18, 20])
            self.assertEqual(len(self._read_chunk(data)), 3)

    def test_selective_jobs_preserve_placeholders_only_for_legacy_number(self):
        self.segment.type = models.SegmentType.SPECIFIC_FRAMES
        self.segment.frames = [14, 20, 22]
        with (
            mock.patch.object(MediaCache, "_read_raw_frames", side_effect=self._raw_frames) as raw,
            mock.patch.object(MediaCache, "_has_key", side_effect=AssertionError),
            mock.patch.object(JobFrameProvider, "get_chunk", side_effect=AssertionError),
        ):
            data, _ = self.cache.prepare_job_playback_chunk(self.job, 1, is_task_chunk=True)
            raw.assert_called_once_with(self.task, [20])
            frames = self._read_chunk(data)
            self.assertEqual([f[0] for f in frames], [(1, 1), (1, 1), (1024, 512)])
            raw.reset_mock()
            data, _ = self.cache.prepare_job_playback_chunk(self.job, 0)
            raw.assert_called_once_with(self.task, [14, 20, 22])
            self.assertEqual(
                [f[0] for f in self._read_chunk(data)], [(80, 120), (1024, 512), (1024, 512)]
            )

    def test_cache_identity_separates_quality_generation_and_index_contract(self):
        item = (io.BytesIO(b"zip"), "application/zip", 0, timezone.now() + timedelta(days=1))
        with (
            mock.patch.object(self.cache, "_get_or_set_cache_item", return_value=item) as get,
            mock.patch.object(self.segment, "refresh_from_db"),
        ):
            keys = []
            for quality, is_task_chunk in ((50, False), (90, False), (50, True)):
                self.cache.get_or_set_job_playback_chunk(
                    self.job, 0, image_quality=quality, is_task_chunk=is_task_chunk
                )
                keys.append(get.call_args.args[0])
            self.segment.chunks_updated_date += timedelta(seconds=1)
            self.cache.get_or_set_job_playback_chunk(self.job, 0)
            keys.append(get.call_args.args[0])
            self.assertEqual(len(set(keys)), 4)
            self.assertTrue(all("jpeg-full-fast-v1_q" in key for key in keys))

    def test_playback_writer_skips_jpeg_optimization_without_changing_pixels(self):
        for mode in ("RGB", "L", "RGBA", "I"):
            with self.subTest(mode=mode), Image.new(mode, (32, 16), 50) as image:
                optimized = ZipCompressedChunkWriter._compress_image(image, 50)
                with mock.patch.object(image, "save", wraps=image.save) as save:
                    fast = _PlaybackChunkWriter._compress_image(image, 50)
                    if mode in ("RGB", "L"):
                        self.assertIs(save.call_args.kwargs["optimize"], False)
                with Image.open(optimized) as reference, Image.open(fast) as output:
                    self.assertEqual(output.size, reference.size)
                    self.assertEqual(output.quantization, reference.quantization)
                    self.assertEqual(output.tobytes(), reference.tobytes())

    def test_invalid_indices_rejected_before_cache_lookup(self):
        with mock.patch.object(self.cache, "_get_or_set_cache_item", side_effect=AssertionError):
            for is_task_chunk, number in ((False, -1), (False, 2), (True, -1), (True, 3)):
                with self.subTest(is_task_chunk=is_task_chunk, number=number):
                    with self.assertRaises(ValidationError):
                        self.cache.get_or_set_job_playback_chunk(
                            self.job, number, is_task_chunk=is_task_chunk
                        )

    def test_invalid_query_parameters(self):
        for params in (
            {},
            {"data_index": 0, "data_num": 0},
            {"data_index": "bad"},
            {"data_index": 0, "data_quality": "original"},
            {"data_index": 0, "data_quality": "bad"},
            *(
                {"data_index": 0, "image_quality": quality}
                for quality in ("bad", "50.5", "", "9", "91")
            ),
        ):
            with self.subTest(params=params), self.assertRaises(ValidationError):
                _JobDataGetter(
                    self.job,
                    **{"data_type": "playback_chunk", "data_quality": "compressed", **params},
                )

    def test_existing_api_ignores_playback_quality_parameter(self):
        getter = _JobDataGetter(
            self.job,
            data_type="chunk",
            data_quality="original",
            data_index=0,
            image_quality="not-an-integer",
        )
        self.assertEqual(getter.quality, models.FrameQuality.ORIGINAL)
        original = DataWithMeta(io.BytesIO(b"unchanged original ZIP"), mime="application/zip")
        with (
            mock.patch.object(JobFrameProvider, "get_chunk", return_value=original) as get,
            mock.patch.object(
                MediaCache, "get_or_set_job_playback_chunk", side_effect=AssertionError
            ),
        ):
            response = getter()
        get.assert_called_once_with(0, quality=models.FrameQuality.ORIGINAL, is_task_chunk=False)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"unchanged original ZIP")

    def test_playback_response_ranges_and_headers(self):
        with mock.patch.object(MediaCache, "_read_raw_frames", side_effect=self._raw_frames):
            data, mime = self.cache.prepare_job_playback_chunk(self.job, 0)
        payload = data.getvalue()
        with mock.patch.object(
            MediaCache, "get_or_set_job_playback_chunk", return_value=(data, mime)
        ):
            responses = []
            for data_range, status, expected in (
                (None, 200, payload),
                ((0, 31), 206, payload[:32]),
                ((None, 16), 206, payload[-16:]),
                ((len(payload), None), 416, b""),
            ):
                response = _JobDataGetter(
                    self.job,
                    data_type="playback_chunk",
                    data_quality="compressed",
                    data_index=0,
                    data_range=data_range,
                )()
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.content, expected)
                self.assertEqual(response["Accept-Ranges"], "bytes")
                self.assertEqual(response["X-Chunk-Size"], str(len(payload)))
                responses.append(response)
            self.assertEqual(responses[1]["Content-Range"], f"bytes 0-31/{len(payload)}")
            self.assertEqual(responses[3]["Content-Range"], f"bytes */{len(payload)}")
            self.assertEqual(len({r["X-Checksum"] for r in responses}), 1)
            self.assertEqual(len({r["X-Updated-Date"] for r in responses}), 1)

    def test_unsupported_media(self):
        for field, value in (
            ("dimension", models.DimensionType.DIM_3D),
            ("media_type", models.MediaType.AUDIO),
            ("mode", models.TaskMode.INTERPOLATION),
        ):
            original = getattr(self.task, field)
            with self.subTest(field=field), self.assertRaises(ValidationError):
                setattr(self.task, field, value)
                self.cache.get_or_set_job_playback_chunk(self.job, 0)
            setattr(self.task, field, original)
