import { render, screen, fireEvent } from "@testing-library/react";
import ToastSystem from "./ToastSystem";

test("renders nothing when toasts is empty", () => {
  const { container } = render(
    <ToastSystem toasts={[]} onDismiss={() => {}} />,
  );
  expect(container.innerHTML).toBe("");
});

test("renders toast with title and subtitle", () => {
  const toasts = [
    { id: 1, kind: "success", title: "Done", sub: "Completed in 5s" },
  ];
  render(<ToastSystem toasts={toasts} onDismiss={() => {}} />);
  expect(screen.getByText("Done")).toBeInTheDocument();
  expect(screen.getByText("Completed in 5s")).toBeInTheDocument();
});

test("renders toast without subtitle", () => {
  const toasts = [{ id: 2, kind: "info", title: "Info only" }];
  render(<ToastSystem toasts={toasts} onDismiss={() => {}} />);
  expect(screen.getByText("Info only")).toBeInTheDocument();
});

test("shows count badge when count > 1", () => {
  const toasts = [{ id: 3, kind: "success", title: "Done", count: 3 }];
  render(<ToastSystem toasts={toasts} onDismiss={() => {}} />);
  expect(screen.getByText("×3")).toBeInTheDocument();
});

test("calls onDismiss when dismiss button clicked", () => {
  const handleDismiss = jest.fn();
  const toasts = [{ id: 4, kind: "danger", title: "Error" }];
  render(<ToastSystem toasts={toasts} onDismiss={handleDismiss} />);
  fireEvent.click(screen.getByRole("button"));
  expect(handleDismiss).toHaveBeenCalledWith(4);
});

test("renders multiple toasts", () => {
  const toasts = [
    { id: 5, kind: "success", title: "First" },
    { id: 6, kind: "info", title: "Second" },
  ];
  render(<ToastSystem toasts={toasts} onDismiss={() => {}} />);
  expect(screen.getByText("First")).toBeInTheDocument();
  expect(screen.getByText("Second")).toBeInTheDocument();
});

test("applies kind class to toast", () => {
  const toasts = [{ id: 7, kind: "danger", title: "Boom" }];
  const { container } = render(
    <ToastSystem toasts={toasts} onDismiss={() => {}} />,
  );
  expect(container.querySelector(".toast.danger")).toBeInTheDocument();
});
