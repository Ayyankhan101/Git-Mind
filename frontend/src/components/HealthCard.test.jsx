import React from "react";
import { render, screen } from "@testing-library/react";
import HealthCard from "./HealthCard";

test("returns null when health is null", () => {
  const { container } = render(<HealthCard health={null} />);
  expect(container.firstChild).toBeNull();
});

test("renders grade and score", () => {
  render(
    <HealthCard
      health={{
        grade: "A",
        score: 92,
        breakdown: { security: 80, documentation: 60 },
      }}
    />,
  );
  expect(screen.getByText("A")).toBeInTheDocument();
  expect(screen.getByText("92/100")).toBeInTheDocument();
});

test("renders dimension labels from breakdown", () => {
  render(
    <HealthCard
      health={{
        grade: "B",
        score: 75,
        breakdown: { security: 80, documentation: 60 },
      }}
    />,
  );
  expect(screen.getByText("Security")).toBeInTheDocument();
  expect(screen.getByText("Docs")).toBeInTheDocument();
});

test("renders F grade", () => {
  render(<HealthCard health={{ grade: "F", score: 15, breakdown: {} }} />);
  expect(screen.getByText("F")).toBeInTheDocument();
});
