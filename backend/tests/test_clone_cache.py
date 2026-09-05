"""S3-compatible clone cache for agents/scanner.py.

No real S3 — a FakeS3Client backed by an in-memory dict stands in for the
boto3 client, same pattern as FakeRedis elsewhere in this suite.
"""

import io
import tarfile

import pytest

from services import clone_cache


class FakeS3Client:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}

    def download_fileobj(self, bucket, key, fileobj):
        from botocore.exceptions import ClientError

        data = self.objects.get((bucket, key))
        if data is None:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "GetObject")
        fileobj.write(data)

    def upload_fileobj(self, fileobj, bucket, key):
        fileobj.seek(0)
        self.objects[(bucket, key)] = fileobj.read()


@pytest.fixture
def fake_s3(monkeypatch):
    client = FakeS3Client()
    monkeypatch.setattr(clone_cache, "_BUCKET", "gitmind-clone-cache-test")
    monkeypatch.setattr(clone_cache, "_client", None)
    monkeypatch.setattr(clone_cache, "_get_client", lambda: client)
    return client


class TestDisabledByDefault:
    def test_enabled_is_false_when_bucket_unset(self, monkeypatch):
        monkeypatch.setattr(clone_cache, "_BUCKET", "")
        assert clone_cache.enabled() is False

    def test_try_restore_noop_when_disabled(self, monkeypatch, tmp_path):
        monkeypatch.setattr(clone_cache, "_BUCKET", "")
        assert clone_cache.try_restore("https://github.com/o/r", "sha1", str(tmp_path)) is False

    def test_store_noop_when_disabled(self, monkeypatch, tmp_path):
        monkeypatch.setattr(clone_cache, "_BUCKET", "")
        clone_cache.store("https://github.com/o/r", "sha1", str(tmp_path))  # must not raise


class TestObjectKey:
    def test_derives_owner_repo_sha(self):
        key = clone_cache._object_key("https://github.com/octocat/Hello-World", "abc123")
        assert key == "octocat/Hello-World@abc123.tar.gz"

    def test_strips_trailing_slash_and_git_suffix(self):
        key = clone_cache._object_key("https://github.com/octocat/Hello-World.git/", "abc123")
        assert key == "octocat/Hello-World@abc123.tar.gz"


class TestStoreAndRestoreRoundtrip:
    def test_restored_content_matches_original(self, fake_s3, tmp_path):
        src = tmp_path / "src"
        src.mkdir()
        (src / "README.md").write_text("hello world")
        (src / "sub").mkdir()
        (src / "sub" / "file.py").write_text("print('hi')")

        clone_cache.store("https://github.com/o/r", "sha1", str(src))

        dest = tmp_path / "dest"
        dest.mkdir()
        assert clone_cache.try_restore("https://github.com/o/r", "sha1", str(dest)) is True
        assert (dest / "README.md").read_text() == "hello world"
        assert (dest / "sub" / "file.py").read_text() == "print('hi')"

    def test_miss_returns_false(self, fake_s3, tmp_path):
        assert clone_cache.try_restore("https://github.com/o/r", "never-stored", str(tmp_path)) is False

    def test_different_sha_is_a_different_key(self, fake_s3, tmp_path):
        src = tmp_path / "src"
        src.mkdir()
        (src / "a.txt").write_text("v1")
        clone_cache.store("https://github.com/o/r", "sha1", str(src))

        dest = tmp_path / "dest"
        dest.mkdir()
        assert clone_cache.try_restore("https://github.com/o/r", "sha2", str(dest)) is False


class TestSafeExtract:
    def test_rejects_path_traversal_member(self, fake_s3, tmp_path):
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            evil = tarfile.TarInfo(name="../../evil.txt")
            payload = b"pwned"
            evil.size = len(payload)
            tar.addfile(evil, io.BytesIO(payload))
        fake_s3.objects[("gitmind-clone-cache-test", "o/r@evilsha.tar.gz")] = buf.getvalue()

        dest = tmp_path / "dest"
        dest.mkdir()
        # try_restore must treat this as a miss (broad except around the extract),
        # not raise, and must not have written anything outside dest.
        assert clone_cache.try_restore("https://github.com/o/r", "evilsha", str(dest)) is False
        assert not (tmp_path / "evil.txt").exists()
