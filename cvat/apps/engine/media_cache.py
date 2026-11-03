# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""A disposable, direct-mapped media cache with a bounded live payload.

Each slot holds one SET value (identity digest + serialized item), no larger than
slot_bytes. Collisions replace the previous item, never return another key's data.
There is no byte ledger to race, leak on expiry, or rebuild after a worker crash.
This bounds live values, NOT RocksDB files, WAL, or compaction scratch space.
"""

import hashlib
import logging

from django.core.cache.backends.base import DEFAULT_TIMEOUT, BaseCache
from django.core.cache.backends.redis import RedisCacheClient
from django.utils.functional import cached_property
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


class BoundedMediaCache(BaseCache):
    # Compare and mutate atomically: a colliding writer must not have its new
    # value deleted/touched by an invalidation of the old logical key.
    _MUTATE = """
        local value = redis.call('GET', KEYS[1])
        if not value or string.sub(value, 1, 32) ~= ARGV[1] then return 0 end
        if ARGV[2] == 'delete' then return redis.call('DEL', KEYS[1]) end
        return redis.call('EXPIRE', KEYS[1], ARGV[2])
    """

    def __init__(self, server, params):
        super().__init__(params)
        options = params.get("OPTIONS", {}).copy()
        self._budget = int(options.pop("budget_bytes"))
        self._slot_bytes = int(options.pop("slot_bytes"))
        self._slots = self._budget // self._slot_bytes if self._slot_bytes > 0 else 0
        if self._slots < 1:
            raise ValueError("Media cache budget must accommodate at least one positive-size slot")
        self._servers = [server]
        self._options = options

    @cached_property
    def _cache(self):
        return RedisCacheClient(self._servers, **self._options)

    def _key(self, key, version):
        key = self.make_and_validate_key(key, version=version)
        identity = hashlib.sha256(key.encode()).digest()
        slot = int.from_bytes(identity, "big") % self._slots
        return f"cvat:bounded-media:{self.key_prefix}:{slot}", identity

    def _timeout(self, timeout):
        if timeout == DEFAULT_TIMEOUT:
            timeout = self.default_timeout
        # Media must always expire, even if a caller requests persistence.
        if timeout is None or self.default_timeout is None or self.default_timeout <= 0:
            raise ValueError("Bounded media cache requires a finite positive TTL")
        return max(0, int(timeout))

    def get(self, key, default=None, version=None):
        slot, identity = self._key(key, version)
        try:
            value = self._cache.get_client().get(slot)
        except RedisError as exc:
            logger.warning("Media cache read failed; treating as a miss: %s", exc)
            return default
        if value is None or value[:32] != identity:
            return default
        return self._cache._serializer.loads(value[32:])

    def set(self, key, value, timeout=DEFAULT_TIMEOUT, version=None):
        slot, identity = self._key(key, version)
        timeout = self._timeout(timeout)
        if timeout == 0:
            return self.delete(key, version=version)
        serialized = self._cache._serializer.dumps(value)
        if isinstance(serialized, int):
            serialized = str(serialized).encode()
        value = identity + serialized
        if len(value) > self._slot_bytes:
            return False
        try:
            return bool(self._cache.get_client(write=True).set(slot, value, ex=timeout))
        except RedisError as exc:
            logger.warning("Media cache write failed; serving without retention: %s", exc)
            return False

    def _mutate(self, key, operation, version):
        slot, identity = self._key(key, version)
        # Unlike optional retention, invalidation must not silently fail and
        # leave old media available after an edit.
        return bool(self._cache.get_client(write=True).eval(self._MUTATE, 1, slot, identity, operation))

    def delete(self, key, version=None):
        return self._mutate(key, "delete", version)

    def touch(self, key, timeout=DEFAULT_TIMEOUT, version=None):
        return self._mutate(key, self._timeout(timeout), version)

    def has_key(self, key, version=None):
        sentinel = object()
        return self.get(key, sentinel, version) is not sentinel

    def clear(self):
        # Never FLUSHDB: legacy media or other consumers may share this server.
        client = self._cache.get_client(write=True)
        for slot in range(self._slots):
            client.delete(f"cvat:bounded-media:{self.key_prefix}:{slot}")
        return True

    def add(self, *args, **kwargs):
        raise NotImplementedError("Media cache supports replacement, not atomic add")

    def incr(self, *args, **kwargs):
        raise NotImplementedError("Media cache stores serialized media, not counters")
