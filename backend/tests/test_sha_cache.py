from unittest.mock import AsyncMock, patch

import services.sha_cache as sha_cache


class TestGetRemoteSha:
    def test_returns_sha_on_success(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "abc123def\n"
            result = sha_cache.get_remote_sha("https://github.com/owner/repo")
            assert result == "abc123def"

    def test_returns_none_on_failure(self):
        with patch("subprocess.run", side_effect=Exception):
            result = sha_cache.get_remote_sha("https://github.com/owner/repo")
            assert result is None

    def test_returns_none_on_nonzero_exit(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value.returncode = 128
            mock_run.return_value.stdout = ""
            result = sha_cache.get_remote_sha("https://github.com/owner/repo")
            assert result is None


class TestUpdateShaIndex:
    async def test_updates_sha_index(self):
        with patch("services.database.upsert_sha_index", new_callable=AsyncMock) as mock_up:
            await sha_cache.update_sha_index("sha1", "session1")
            mock_up.assert_awaited_once_with("sha1", "session1")

    async def test_logs_warning_on_failure(self):
        with (
            patch("services.database.upsert_sha_index", new_callable=AsyncMock, side_effect=Exception("db down")),
            patch("services.sha_cache.logger") as mock_log,
        ):
            await sha_cache.update_sha_index("sha1", "session1")
            mock_log.warning.assert_called_once()


class TestFindCachedSnapshot:
    async def test_returns_none_when_sha_not_in_index(self):
        with patch("services.database.get_sha_index_entry", new_callable=AsyncMock, return_value=None):
            result = await sha_cache.find_cached_snapshot("https://github.com/owner/repo", "sha1")
            assert result is None

    async def test_returns_none_when_analysis_not_found(self):
        with (
            patch("services.database.get_sha_index_entry", new_callable=AsyncMock, return_value="sess1"),
            patch("services.database.get_analysis_db", new_callable=AsyncMock, return_value=None),
        ):
            result = await sha_cache.find_cached_snapshot("https://github.com/owner/repo", "sha1")
            assert result is None

    async def test_returns_snapshot_when_match(self):
        snap = {"repo_url": "https://github.com/owner/repo", "data": "test"}
        with (
            patch("services.database.get_sha_index_entry", new_callable=AsyncMock, return_value="sess1"),
            patch("services.database.get_analysis_db", new_callable=AsyncMock, return_value=snap),
        ):
            result = await sha_cache.find_cached_snapshot("https://github.com/owner/repo", "sha1")
            assert result == snap

    async def test_returns_none_on_repo_url_mismatch(self):
        snap = {"repo_url": "https://github.com/other/repo", "data": "test"}
        with (
            patch("services.database.get_sha_index_entry", new_callable=AsyncMock, return_value="sess1"),
            patch("services.database.get_analysis_db", new_callable=AsyncMock, return_value=snap),
        ):
            result = await sha_cache.find_cached_snapshot("https://github.com/owner/repo", "sha1")
            assert result is None
