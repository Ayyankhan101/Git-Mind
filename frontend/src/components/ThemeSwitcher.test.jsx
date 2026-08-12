import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ThemeSwitcher from "./ThemeSwitcher";

const dispatch = jest.fn();

beforeEach(() => jest.clearAllMocks());

test("shows Freebuff as the default theme", () => {
  render(<ThemeSwitcher theme="obsidian" dispatch={dispatch} />);
  const button = screen.getByRole("button", { name: /Change theme/ });
  expect(button).toHaveTextContent("Freebuff");
});

test("opens listbox with all themes on click", () => {
  render(<ThemeSwitcher theme="obsidian" dispatch={dispatch} />);
  fireEvent.click(screen.getByRole("button", { name: /Change theme/ }));
  const listbox = screen.getByRole("listbox", { name: "Theme picker" });
  expect(listbox).toBeInTheDocument();
  const freebuffOpt = screen.getByRole("option", {
    name: /Freebuff/,
  });
  expect(freebuffOpt).toHaveAttribute("aria-selected", "true");
  expect(freebuffOpt).toHaveTextContent("Electric Blue + Violet");
  // at least a representative set renders; exact count couples to the theme list
  expect(screen.getAllByRole("option").length).toBeGreaterThanOrEqual(13);
  // exact names (avoid /Amber/ also matching "Circuit · Amber Tech")
  expect(screen.getByText("Amber")).toBeInTheDocument();
  expect(screen.getByText("Daylight")).toBeInTheDocument();
});

test("selecting a theme dispatches SET_THEME", () => {
  render(<ThemeSwitcher theme="obsidian" dispatch={dispatch} />);
  fireEvent.click(screen.getByRole("button", { name: /Change theme/ }));
  fireEvent.click(screen.getByRole("option", { name: /Matrix/ }));
  expect(dispatch).toHaveBeenCalledWith({ type: "SET_THEME", theme: "matrix" });
});

test("closes popup after selecting", () => {
  render(<ThemeSwitcher theme="obsidian" dispatch={dispatch} />);
  fireEvent.click(screen.getByRole("button", { name: /Change theme/ }));
  fireEvent.click(screen.getByRole("option", { name: /Neon/ }));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("closes popup on outside click", () => {
  render(<ThemeSwitcher theme="obsidian" dispatch={dispatch} />);
  fireEvent.click(screen.getByRole("button", { name: /Change theme/ }));
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
