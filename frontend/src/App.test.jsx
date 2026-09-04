import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { loadSharedAnalysis, exchangeGithubOAuthCode } from "./api";

jest.mock("./components/LandingPage", () => {
  return function MockLandingPage() {
    return <div>GitMind</div>;
  };
});

jest.mock("./components/SceneManager", () => {
  return function MockSceneManager({ children }) {
    return children?.({ prefersReduced: false }) || null;
  };
});

jest.mock("./components/DashboardLayout", () => {
  return function MockDashboardLayout() {
    return (
      <nav>
        <button aria-label="Keyboard shortcuts">?</button>
        <button aria-label="Command palette">⌘K</button>
        <button aria-label="Repositories">Repos</button>
      </nav>
    );
  };
});

jest.mock("./components/PostProcessing", () => {
  return function MockPostProcessing() {
    return null;
  };
});

jest.mock("./api", () => ({
  fetchRepos: jest.fn(),
  loadSharedAnalysis: jest.fn().mockRejectedValue(new Error("no share")),
  generateFix: jest.fn(),
  exchangeGithubOAuthCode: jest.fn().mockRejectedValue(new Error("no handoff")),
  WS_BASE: "ws://localhost:8002",
  BASE: "http://localhost:8002",
  isValidGhToken: jest.fn().mockReturnValue(true),
}));

// mermaid dependency was removed; no production code imports it anymore

beforeAll(() => {
  global.WebSocket = class MockWS {
    constructor() {
      this.readyState = 0;
    }
    close() {}
    send() {}
  };
});

afterAll(() => {
  delete global.WebSocket;
});

function renderApp(path = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

test("renders app root", () => {
  renderApp("/");
  const elements = screen.getAllByText("GitMind");
  expect(elements.length).toBeGreaterThanOrEqual(1);
});

test("renders keyboard help trigger", async () => {
  renderApp();
  expect(
    await screen.findByLabelText("Keyboard shortcuts"),
  ).toBeInTheDocument();
});

test("renders command palette trigger", async () => {
  renderApp();
  expect(await screen.findByLabelText("Command palette")).toBeInTheDocument();
});

test("renders repository toggle", async () => {
  renderApp();
  expect(await screen.findByLabelText("Repositories")).toBeInTheDocument();
});

test("shows an error overlay when a shared analysis 404s", async () => {
  loadSharedAnalysis.mockRejectedValueOnce(
    Object.assign(new Error("Analysis not found"), { status: 404 }),
  );
  renderApp("/?share=missing");
  expect(
    await screen.findByText(/could not open analysis/i),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
});

test("shows the unlock flow for a locked shared analysis", async () => {
  loadSharedAnalysis.mockRejectedValueOnce(
    Object.assign(new Error("Auth required"), { status: 401 }),
  );
  renderApp("/?share=old-session");
  expect(
    await screen.findByRole("button", { name: /unlock/i }),
  ).toBeInTheDocument();
});

test("exchanges a GitHub OAuth handoff code and shows a success toast", async () => {
  exchangeGithubOAuthCode.mockResolvedValueOnce({
    access_token: "gho_realtoken",
    login: "octocat",
  });
  renderApp("/dashboard?gh_handoff=abc123");
  expect(await screen.findByText("Signed in with GitHub")).toBeInTheDocument();
  expect(screen.getByText("as octocat")).toBeInTheDocument();
  expect(exchangeGithubOAuthCode).toHaveBeenCalledWith("abc123");
});

test("shows a failure toast when the OAuth handoff exchange fails", async () => {
  exchangeGithubOAuthCode.mockRejectedValueOnce(
    new Error("Invalid or expired sign-in code"),
  );
  renderApp("/dashboard?gh_handoff=bad-code");
  expect(await screen.findByText("GitHub sign-in failed")).toBeInTheDocument();
  expect(
    screen.getByText("Invalid or expired sign-in code"),
  ).toBeInTheDocument();
});

test("shows a failure toast when GitHub redirects back with an error", async () => {
  renderApp("/dashboard?gh_oauth_error=exchange_failed");
  expect(await screen.findByText("GitHub sign-in failed")).toBeInTheDocument();
  expect(screen.getByText("exchange_failed")).toBeInTheDocument();
  expect(exchangeGithubOAuthCode).not.toHaveBeenCalled();
});
