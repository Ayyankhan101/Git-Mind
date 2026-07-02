import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Onboarding from "./Onboarding";

test("renders example repos", () => {
  render(<Onboarding onLoad={jest.fn()} />);
  expect(screen.getByText("vercel/next.js")).toBeInTheDocument();
  expect(screen.getByText("tiangolo/fastapi")).toBeInTheDocument();
});

test("calls onLoad with username when example clicked", () => {
  const onLoad = jest.fn();
  render(<Onboarding onLoad={onLoad} />);
  fireEvent.click(screen.getByText("vercel/next.js"));
  expect(onLoad).toHaveBeenCalledWith("vercel");
});

test("renders input for username", () => {
  render(<Onboarding onLoad={jest.fn()} />);
  expect(
    screen.getByPlaceholderText("paste a GitHub username…"),
  ).toBeInTheDocument();
});
