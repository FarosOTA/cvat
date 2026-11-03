# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import io
import os
import pickle
import time
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from unittest import mock

from redis import Redis
from redis.exceptions import ConnectionError, ResponseError

from cvat.apps.engine import models
from cvat.apps.engine.cache import MediaCache
from cvat.apps.engine.media_cache import BoundedMediaCache


@unittest.skipUnless(os.getenv("CVAT_TEST_MEDIA_CACHE_URL"), "Requires a disposable Kvrocks server")
class TestBoundedMediaCache(unittest.TestCase):
    def setUp(self):
        self.client = Redis.from_url(os.environ["CVAT_TEST_MEDIA_CACHE_URL"])
        self.cache = self._make_cache()

    def _make_cache(self, budget=4096, slot=1024):
        cache = BoundedMediaCache(
            os.environ["CVAT_TEST_MEDIA_CACHE_URL"],
            {
                "TIMEOUT": 60,
                "KEY_PREFIX": f"test-{uuid.uuid4()}",
                "OPTIONS": {"budget_bytes": budget, "slot_bytes": slot},
            },
        )
        self.addCleanup(cache.clear)
        return cache

    def test_concurrent_replacements_bound_serialized_values(self):
        def write(i):
            key = f"job_{i}_preview_chunk_jpeg-512-q50-v2_generation_0_0"
            value = bytes([i % 256]) * (113 + i % 700)
            self.cache.set(key, value)
            result = self.cache.get(key)
            self.assertIn(result, (None, value))  # a collision must never return another chunk

        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(write, range(400)))
        client = self.client
        keys = list(client.scan_iter(f"cvat:bounded-media:{self.cache.key_prefix}:*"))
        self.assertLessEqual(len(keys), 4)
        self.assertLessEqual(sum(client.strlen(k) for k in keys), 4096)
        self.assertTrue(all(0 < client.ttl(k) <= 60 for k in keys))

    def test_collision_invalidation_and_bulk_operations(self):
        # A one-slot cache guarantees a collision without depending on a hash implementation.
        self.cache = self._make_cache(budget=1024)
        self.cache.set("old", b"first")
        self.cache.set("new", b"second")
        self.assertFalse(self.cache.has_key("old"))
        self.assertFalse(self.cache.delete("old"))
        self.assertFalse(self.cache.touch("old", 0))
        self.cache.delete_many(["old"])
        self.assertEqual(self.cache.get_many(["old", "new"]), {"new": b"second"})
        self.assertTrue(self.cache.touch("new", 60))
        self.cache.delete_many(["new"])
        self.assertIsNone(self.cache.get("new"))

    def test_serialization_boundary_and_expiry(self):
        # Protocol framing and identity count against the budget, not only image bytes.
        value = b"x" * 500
        size = 32 + len(pickle.dumps(value, protocol=pickle.HIGHEST_PROTOCOL))
        self.cache = self._make_cache(budget=size, slot=size)
        self.assertTrue(self.cache.set("frame", value, 1))
        self.assertFalse(self.cache.set("oversized", value + b"x"))
        self.assertEqual(self.cache.get("frame"), value)
        time.sleep(1.1)
        self.assertIsNone(self.cache.get("frame"))
        self.assertTrue(self.cache.set("frame", value))
        self.cache.set("frame", value, 0)
        self.assertIsNone(self.cache.get("frame"))
        with self.assertRaises(ValueError):
            self.cache.set("frame", value, None)

    def test_clear_preserves_unrelated_data(self):
        client = self.client
        unrelated = f"legacy-{uuid.uuid4()}"
        client.set(unrelated, b"keep", ex=60)
        self.addCleanup(client.delete, unrelated)
        self.cache.set("frame", b"discard")
        self.cache.clear()
        self.assertIsNone(self.cache.get("frame"))
        self.assertEqual(client.get(unrelated), b"keep")

    def _load_preview(self, *, evict=False, inside_worker=False):
        payload = b"a-real-preview-payload"

        def enqueue(**kwargs):
            kwargs["create_callback"]()
            if evict:
                self.cache.clear()
            return object()

        with (
            mock.patch("cvat.apps.engine.cache._is_run_inside_rq", return_value=inside_worker),
            mock.patch.object(MediaCache, "_cache", return_value=self.cache),
            mock.patch.object(MediaCache, "_get_queue", return_value=object()),
            mock.patch(
                "cvat.apps.engine.cache.get_rq_lock_for_job",
                side_effect=lambda *a: nullcontext(),
            ),
            mock.patch("cvat.apps.engine.cache.enqueue_create_chunk_job", side_effect=enqueue),
            mock.patch("cvat.apps.engine.cache.wait_for_rq_job"),
            mock.patch.object(
                MediaCache,
                "_prepare_cloud_preview",
                side_effect=lambda *a: (io.BytesIO(payload), "image/jpeg"),
            ),
        ):
            result, mime = MediaCache().get_or_set_cloud_preview(models.CloudStorage(id=42))
        self.assertEqual(result.getvalue(), payload)
        self.assertEqual(mime, "image/jpeg")

    def test_worker_result_retained(self):
        self._load_preview()

    def test_worker_result_evicted_before_request_reads_it(self):
        self._load_preview(evict=True)

    def test_oversized_item_still_delivered(self):
        self.cache = self._make_cache(budget=32, slot=32)
        self._load_preview()

    def test_capacity_rejection_still_delivered(self):
        with mock.patch.object(Redis, "set", side_effect=ResponseError("Space limit reached")):
            with self.assertLogs("cvat.apps.engine.media_cache", level="WARNING"):
                self._load_preview()

    def test_nested_worker_delivers_without_retention(self):
        self.cache = self._make_cache(budget=32, slot=32)
        self._load_preview(inside_worker=True)

    def test_cache_unavailable_still_delivered(self):
        with (
            mock.patch.object(Redis, "get", side_effect=ConnectionError("Unavailable")),
            mock.patch.object(Redis, "set", side_effect=ConnectionError("Unavailable")),
            self.assertLogs("cvat.apps.engine.media_cache", level="WARNING"),
        ):
            self._load_preview()

    def test_invalidation_failure_is_not_silenced(self):
        with mock.patch.object(Redis, "eval", side_effect=ConnectionError("Unavailable")):
            with self.assertRaises(ConnectionError):
                self.cache.delete("frame")
