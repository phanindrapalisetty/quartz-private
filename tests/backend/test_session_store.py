"""
SessionStore unit tests — TTL, sliding window, CRUD.
"""
import time

import pytest

from services.session_store import SessionStore

SAMPLE = {"user_email": "a@b.com", "access_token": "tok"}


def test_create_and_get():
    store = SessionStore()
    sid = store.create(SAMPLE)
    assert sid is not None
    data = store.get(sid)
    assert data["user_email"] == "a@b.com"


def test_get_unknown_session_returns_none():
    store = SessionStore()
    assert store.get("does-not-exist") is None


def test_update():
    store = SessionStore()
    sid = store.create(SAMPLE)
    store.update(sid, {"user_email": "updated@b.com"})
    assert store.get(sid)["user_email"] == "updated@b.com"


def test_update_unknown_session_returns_false():
    store = SessionStore()
    result = store.update("ghost", {"x": 1})
    assert result is False


def test_delete():
    store = SessionStore()
    sid = store.create(SAMPLE)
    store.delete(sid)
    assert store.get(sid) is None


def test_delete_nonexistent_is_silent():
    store = SessionStore()
    store.delete("not-here")  # should not raise


def test_session_expires_after_ttl():
    store = SessionStore(ttl_seconds=1)
    sid = store.create(SAMPLE)
    assert store.get(sid) is not None
    time.sleep(1.1)
    assert store.get(sid) is None


def test_sliding_window_resets_expiry():
    store = SessionStore(ttl_seconds=2)
    sid = store.create(SAMPLE)

    # Access at ~1s — should reset the clock
    time.sleep(1.0)
    assert store.get(sid) is not None  # access resets last_accessed

    # Wait another 1s — total 2s from creation, but only 1s since last access
    time.sleep(1.0)
    assert store.get(sid) is not None  # still alive because of sliding window

    # Now wait long enough past the TTL without touching
    time.sleep(2.1)
    assert store.get(sid) is None


def test_multiple_sessions_are_independent():
    store = SessionStore()
    sid1 = store.create({"user_email": "user1@x.com", "access_token": "t1"})
    sid2 = store.create({"user_email": "user2@x.com", "access_token": "t2"})

    assert store.get(sid1)["user_email"] == "user1@x.com"
    assert store.get(sid2)["user_email"] == "user2@x.com"

    store.delete(sid1)
    assert store.get(sid1) is None
    assert store.get(sid2) is not None  # unaffected


def test_session_id_is_unique():
    store = SessionStore()
    ids = {store.create(SAMPLE) for _ in range(100)}
    assert len(ids) == 100  # all unique
