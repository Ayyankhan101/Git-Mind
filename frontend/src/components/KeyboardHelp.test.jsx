import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import KeyboardHelp from "./KeyboardHelp";

test("renders nothing when closed", () => {
  render(<KeyboardHelp open={false} onClose={jest.fn()} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("renders shortcuts when open", () => {
  render(<KeyboardHelp open={true} onClose={jest.fn()} />);
  expect(
    screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeInTheDocument();
  expect(screen.getByText("General")).toBeInTheDocument();
  expect(screen.getByText("Navigation")).toBeInTheDocument();
  expect(screen.getByText("Architecture diagram")).toBeInTheDocument();
  expect(screen.getByText("Sidebar")).toBeInTheDocument();
});

test("calls onClose on Escape key", () => {
  const onClose = jest.fn();
  render(<KeyboardHelp open={true} onClose={onClose} />);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onClose).toHaveBeenCalled();
});

test("does not call onClose on other keys", () => {
  const onClose = jest.fn();
  render(<KeyboardHelp open={true} onClose={onClose} />);
  fireEvent.keyDown(window, { key: "a" });
  expect(onClose).not.toHaveBeenCalled();
});
