import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ShareErrorOverlay from "./ShareErrorOverlay";

const base = { kind: "not_found", message: "This link has expired." };

describe("ShareErrorOverlay", () => {
  it("shows the message with a retry action", () => {
    const onRetry = jest.fn();
    render(
      <ShareErrorOverlay
        error={base}
        onRetry={onRetry}
        onUnlock={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText("This link has expired.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("shows an unlock input for locked links", () => {
    const onUnlock = jest.fn();
    render(
      <ShareErrorOverlay
        error={{ kind: "locked", message: "Add your token." }}
        onRetry={jest.fn()}
        onUnlock={onUnlock}
        onClose={jest.fn()}
      />,
    );
    const input = screen.getByLabelText(/github token/i);
    fireEvent.change(input, { target: { value: "ghp_abc123" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    expect(onUnlock).toHaveBeenCalledWith("ghp_abc123");
  });
  it("closes via the close button", () => {
    const onClose = jest.fn();
    render(
      <ShareErrorOverlay
        error={base}
        onRetry={jest.fn()}
        onUnlock={jest.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
