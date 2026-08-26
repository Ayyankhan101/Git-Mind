import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import LandingPage from "./LandingPage";

// CRA's jest config sets `resetMocks: true`, which wipes `jest.fn(impl)`
// implementations before each test. So behaviors the component depends on
// (e.g. gsap.context returning an object with .revert()) are defined as plain
// functions here rather than jest.fn() with implementations.
jest.mock("gsap", () => ({
  gsap: {
    registerPlugin: jest.fn(),
    fromTo: jest.fn(),
    to: jest.fn(),
    from: jest.fn(),
    set: jest.fn(),
    timeline: () => ({
      from: jest.fn(),
      to: jest.fn(),
      fromTo: jest.fn(),
      set: jest.fn(),
    }),
    context: (cb) => {
      if (typeof cb === "function") cb();
      return { revert: jest.fn() };
    },
    utils: {
      toArray: () => [],
    },
    ticker: {
      add: jest.fn(),
      remove: jest.fn(),
      lagSmoothing: jest.fn(),
    },
    matchMedia: () => ({ add: jest.fn() }),
  },
}));

jest.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {
    update: jest.fn(),
    create: jest.fn(),
    refresh: jest.fn(),
    getAll: () => [],
  },
}));

jest.mock("lenis", () => {
  return class Lenis {
    on() {
      return this;
    }
    off() {
      return this;
    }
    start() {}
    stop() {}
    destroy() {}
    raf() {}
  };
});

describe("LandingPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders navigation links", () => {
    render(<LandingPage onLoad={jest.fn()} onAnalyzeUrl={jest.fn()} />);
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("How it works")).toBeInTheDocument();
  });

  it("renders the input field for GitHub URL or username", () => {
    render(<LandingPage onLoad={jest.fn()} onAnalyzeUrl={jest.fn()} />);
    expect(
      screen.getByLabelText("GitHub username or repository URL"),
    ).toBeInTheDocument();
  });

  it("calls onLoad with username when plain text is submitted", () => {
    const onLoad = jest.fn();
    render(<LandingPage onLoad={onLoad} onAnalyzeUrl={jest.fn()} />);
    const input = screen.getByLabelText("GitHub username or repository URL");
    fireEvent.change(input, { target: { value: "facebook" } });
    fireEvent.submit(
      screen.getByRole("form", { name: "Analyze a GitHub repository" }),
    );
    expect(onLoad).toHaveBeenCalledWith("facebook");
  });

  it("calls onAnalyzeUrl when GitHub URL is submitted", () => {
    const onAnalyzeUrl = jest.fn();
    render(<LandingPage onLoad={jest.fn()} onAnalyzeUrl={onAnalyzeUrl} />);
    const input = screen.getByLabelText("GitHub username or repository URL");
    fireEvent.change(input, {
      target: { value: "https://github.com/facebook/react" },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Analyze a GitHub repository" }),
    );
    expect(onAnalyzeUrl).toHaveBeenCalledWith(
      "https://github.com/facebook/react",
    );
  });

  it("passes a GitHub token through when provided", () => {
    const onLoad = jest.fn();
    render(<LandingPage onLoad={onLoad} onAnalyzeUrl={jest.fn()} />);
    fireEvent.click(screen.getByText("Use GitHub token"));
    fireEvent.change(screen.getByLabelText("GitHub personal access token"), {
      target: { value: "ghp_test123" },
    });
    const input = screen.getByLabelText("GitHub username or repository URL");
    fireEvent.change(input, { target: { value: "facebook" } });
    fireEvent.submit(
      screen.getByRole("form", { name: "Analyze a GitHub repository" }),
    );
    expect(onLoad).toHaveBeenCalledWith("facebook", "ghp_test123");
  });

  it("submits empty input without calling onLoad", () => {
    const onLoad = jest.fn();
    render(<LandingPage onLoad={onLoad} onAnalyzeUrl={jest.fn()} />);
    fireEvent.submit(
      screen.getByRole("form", { name: "Analyze a GitHub repository" }),
    );
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("renders the hero without fake product chrome", () => {
    const { container } = render(
      <LandingPage onLoad={jest.fn()} onAnalyzeUrl={jest.fn()} />,
    );
    // The fake window/radar preview was stripped — the hero is typographic.
    expect(container.querySelector(".lp-preview")).toBeNull();
    expect(container.querySelector(".lp-radar")).toBeNull();
  });

  it("renders the signature radar sweep in the hero", () => {
    const { container } = render(
      <LandingPage onLoad={() => {}} onAnalyzeUrl={() => {}} />,
    );
    // Editorial signature moment: pure-CSS agent radar behind the copy.
    expect(container.querySelector(".lp-hero-radar")).toBeTruthy();
  });

  it("renders how-it-works with flow layout", () => {
    const { container } = render(
      <LandingPage onLoad={() => {}} onAnalyzeUrl={() => {}} />,
    );
    const how = container.querySelector("#how-it-works");
    expect(how).toBeTruthy();
    const steps = how.querySelectorAll(".lp-how-step");
    expect(steps.length).toBe(3);
    const nums = how.querySelectorAll(".lp-how-step-num");
    expect(nums.length).toBe(3);
  });
});
