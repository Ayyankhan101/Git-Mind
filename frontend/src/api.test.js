import { fetchRepos, fetchSummary, loadSharedAnalysis, orgAudit } from "./api";

function mockFetchOnce(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  });
}

function mockFetchError(message) {
  global.fetch = jest.fn().mockRejectedValue(new Error(message));
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  delete global.fetch;
  jest.useRealTimers();
});

describe("error parsing", () => {
  test("parses plain string error", async () => {
    mockFetchOnce(400, { error: "not found" });
    await expect(fetchRepos("test-user")).rejects.toThrow("not found");
  });

  test("parses detail array error", async () => {
    mockFetchOnce(422, { detail: [{ msg: "field required", loc: ["body"] }] });
    await expect(fetchRepos("test-user")).rejects.toThrow("field required");
  });

  test("parses nested error", async () => {
    mockFetchOnce(403, { error: { msg: "rate limited" } });
    await expect(fetchRepos("test-user")).rejects.toThrow("rate limited");
  });

  test("falls back to status for unknown shape", async () => {
    mockFetchOnce(500, { unexpected: true });
    await expect(fetchRepos("test-user")).rejects.toThrow("Server error 500");
  });

  test("handles null body", async () => {
    mockFetchOnce(400, null);
    await expect(fetchRepos("test-user")).rejects.toThrow("Server error 400");
  });

  test("handles network error", async () => {
    mockFetchError("NetworkError");
    await expect(fetchRepos("test-user")).rejects.toThrow(
      "Cannot reach the backend",
    );
  });
});

describe("fetchRepos", () => {
  test("returns repo list on success", async () => {
    const repos = [
      { name: "repo1", url: "https://github.com/u/r1", private: false },
    ];
    mockFetchOnce(200, { repos });
    await expect(fetchRepos("test-user")).resolves.toEqual(repos);
  });

  test("passes X-GH-Token header when provided", async () => {
    mockFetchOnce(200, { repos: [] });
    await fetchRepos("test-user", "ghp_abc123");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/repos/"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-GH-Token": "ghp_abc123" }),
      }),
    );
  });
});

describe("fetchSummary", () => {
  test("sends session_id", async () => {
    mockFetchOnce(200, { summary: "nice code" });
    await fetchSummary("session-1");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/summary"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("session-1"),
      }),
    );
  });
});

describe("loadSharedAnalysis", () => {
  test("fetches analysis by session id", async () => {
    const data = { repo_name: "test", architecture_diagram: "graph" };
    mockFetchOnce(200, data);
    await expect(loadSharedAnalysis("share-1")).resolves.toEqual(data);
  });
});

describe("orgAudit", () => {
  test("sends repos array in body", async () => {
    mockFetchOnce(200, { results: [] });
    const repoUrls = ["https://github.com/a/b", "https://github.com/c/d"];
    await orgAudit(repoUrls);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/org-audit"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("github.com/a/b"),
      }),
    );
  });
});
