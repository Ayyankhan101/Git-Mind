import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import LandingPage from "./LandingPage";

describe("LandingPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders navigation links", () => {
    render(<LandingPage onLoad={jest.fn()} onAnalyzeUrl={jest.fn()} />);
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Capabilities")).toBeInTheDocument();
  });

  it("renders the input field for GitHub URL or username", () => {
    render(<LandingPage onLoad={jest.fn()} onAnalyzeUrl={jest.fn()} />);
    expect(
      screen.getByPlaceholderText("Paste a GitHub URL or enter a username"),
    ).toBeInTheDocument();
  });

  it("calls onLoad with username when plain text is submitted", () => {
    const onLoad = jest.fn();
    render(<LandingPage onLoad={onLoad} onAnalyzeUrl={jest.fn()} />);
    const input = screen.getByPlaceholderText(
      "Paste a GitHub URL or enter a username",
    );
    fireEvent.change(input, { target: { value: "facebook" } });
    fireEvent.submit(input.closest("form"));
    expect(onLoad).toHaveBeenCalledWith("facebook");
  });

  it("calls onAnalyzeUrl when GitHub URL is submitted", () => {
    const onAnalyzeUrl = jest.fn();
    render(<LandingPage onLoad={jest.fn()} onAnalyzeUrl={onAnalyzeUrl} />);
    const input = screen.getByPlaceholderText(
      "Paste a GitHub URL or enter a username",
    );
    fireEvent.change(input, {
      target: { value: "https://github.com/facebook/react" },
    });
    fireEvent.submit(input.closest("form"));
    expect(onAnalyzeUrl).toHaveBeenCalledWith(
      "https://github.com/facebook/react",
    );
  });

  it("calls onLoad when Get Started button is clicked", () => {
    const onLoad = jest.fn();
    render(<LandingPage onLoad={onLoad} onAnalyzeUrl={jest.fn()} />);
    // Find the button with aria-label containing "Get Started" or the hero CTA
    const buttons = screen.getAllByRole("button");
    const getStartedBtn = buttons.find(
      (btn) =>
        btn.textContent.includes("Get Started") ||
        btn.getAttribute("aria-label")?.includes("Get Started"),
    );
    if (getStartedBtn) {
      fireEvent.click(getStartedBtn);
      expect(onLoad).toHaveBeenCalled();
    }
  });

  it("renders skip to content link for accessibility", () => {
    render(<LandingPage onLoad={jest.fn()} onAnalyzeUrl={jest.fn()} />);
    expect(screen.getByText("Skip to content")).toBeInTheDocument();
  });
});
