import { render, screen } from "@testing-library/react";
import ErrorBoundary from "../components/ErrorBoundary";

const GoodChild = () => <div>all good</div>;

test("renders children when no error", () => {
  render(
    <ErrorBoundary>
      <GoodChild />
    </ErrorBoundary>,
  );
  expect(screen.getByText("all good")).toBeInTheDocument();
});

const Buggy = () => {
  throw new Error("test error");
};

test("catches error and shows fallback", () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <Buggy />
    </ErrorBoundary>,
  );
  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  console.error.mockRestore();
});
