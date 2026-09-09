import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ThemeSwitcher from "./ThemeSwitcher";

const dispatch = jest.fn();

beforeEach(() => jest.clearAllMocks());

test("shows Coral as the default theme", () => {
  render(<ThemeSwitcher theme="default" dispatch={dispatch} />);
  const button = screen.getByRole("button", { name: /Change theme/ });
  expect(button).toHaveTextContent("Coral");
});

test("opens listbox with all themes on click", () => {
  render(<ThemeSwitcher theme="default" dispatch={dispatch} />);
  fireEvent.click(screen.getByRole("button", { name: /Change theme/ }));
  const listbox = screen.getByRole("listbox", { name: "Theme picker" });
  expect(listbox).toBeInTheDocument();
  const coralOpt = screen.getByRole("option", {
    name: /Coral/,
  });
  expect(coralOpt).toHaveAttribute("aria-selected", "true");
  expect(coralOpt).toHaveTextContent("Warm editorial");
  expect(screen.getAllByRole("option").length).toBeGreaterThanOrEqual(4);
  expect(screen.getByText("Ocean")).toBeInTheDocument();
  expect(screen.getByText("Forest")).toBeInTheDocument();
  expect(screen.getByText("Sunset")).toBeInTheDocument();
});

test("selecting a theme dispatches SET_THEME", () => {
  render(<ThemeSwitcher theme="default" dispatch={dispatch} />);
  fireEvent.click(screen.getByRole("button", { name: /Change theme/ }));
  fireEvent.click(screen.getByRole("option", { name: /Ocean/ }));
  expect(dispatch).toHaveBeenCalledWith({ type: "SET_THEME", theme: "ocean" });
});

test("closes popup after selecting", () => {
  render(<ThemeSwitcher theme="default" dispatch={dispatch} />);
  fireEvent.click(screen.getByRole("button", { name: /Change theme/ }));
  fireEvent.click(screen.getByRole("option", { name: /Forest/ }));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("closes popup on outside click", () => {
  render(<ThemeSwitcher theme="default" dispatch={dispatch} />);
  fireEvent.click(screen.getByRole("button", { name: /Change theme/ }));
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
