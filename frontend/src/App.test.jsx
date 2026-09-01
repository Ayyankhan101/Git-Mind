import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { loadSharedAnalysis } from "./api";

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

jest.mock("./components/PostProcessing", () => {
  return function MockPostProcessing() {
    return null;
  };
});

jest.mock("./api", () => ({
  fetchRepos: jest.fn(),
  loadSharedAnalysis: jest.fn().mockRejectedValue(new Error("no share")),
  generateFix: jest.fn(),
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
