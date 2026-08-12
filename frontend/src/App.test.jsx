import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

jest.mock("./components/LandingPage", () => {
  return function MockLandingPage() {
    return <div>GitMind</div>;
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

test("renders theme switcher", () => {
  renderApp();
  expect(screen.getByLabelText("Change theme")).toBeInTheDocument();
});

test("renders keyboard help trigger", () => {
  renderApp();
  expect(screen.getByLabelText("Keyboard shortcuts")).toBeInTheDocument();
});

test("renders command palette trigger", () => {
  renderApp();
  expect(screen.getByLabelText("Command palette")).toBeInTheDocument();
});

test("renders repository toggle", () => {
  renderApp();
  expect(screen.getByLabelText("Repositories")).toBeInTheDocument();
});
