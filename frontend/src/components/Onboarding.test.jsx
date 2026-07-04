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
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Onboarding from "./Onboarding";

test("renders example repos", () => {
  render(<Onboarding onLoad={vi.fn()} />);
  expect(screen.getByText("vercel/next.js")).toBeInTheDocument();
  expect(screen.getByText("tiangolo/fastapi")).toBeInTheDocument();
});

test("calls onLoad with username when example clicked", () => {
  const onLoad = vi.fn();
  render(<Onboarding onLoad={onLoad} />);
  fireEvent.click(screen.getByText("vercel/next.js"));
  expect(onLoad).toHaveBeenCalledWith("vercel");
});

test("renders input for username", () => {
  render(<Onboarding onLoad={vi.fn()} />);
  expect(
    screen.getByPlaceholderText("paste a GitHub username…"),
  ).toBeInTheDocument();
});
