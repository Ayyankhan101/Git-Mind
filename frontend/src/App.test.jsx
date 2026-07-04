import {
  vi,
  describe,
  it,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("./api", () => ({
  fetchRepos: vi.fn(),
  loadSharedAnalysis: vi.fn().mockRejectedValue(new Error("no share")),
  generateFix: vi.fn(),
  WS_BASE: "ws://localhost:8002",
  BASE: "http://localhost:8002",
  isValidGhToken: vi.fn().mockReturnValue(true),
}));

// mermaid is ESM-only and breaks Jest; mock it before the import chain pulls it in
vi.mock("mermaid", () => ({
  run: vi.fn(),
  initialize: vi.fn(),
  mermaidAPI: { getConfig: () => ({}) },
}));

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

test("renders app root", () => {
  render(<App />);
  const elements = screen.getAllByText("GitMind");
  expect(elements.length).toBeGreaterThanOrEqual(1);
});

test("renders theme switcher", () => {
  render(<App />);
  expect(screen.getByTitle("Change theme")).toBeInTheDocument();
});

test("renders keyboard help trigger", () => {
  render(<App />);
  expect(screen.getByLabelText("Keyboard shortcuts")).toBeInTheDocument();
});

test("renders command palette trigger", () => {
  render(<App />);
  expect(screen.getByLabelText("Command palette")).toBeInTheDocument();
});

test("renders repository toggle", () => {
  render(<App />);
  expect(screen.getByLabelText("Repositories")).toBeInTheDocument();
});
