import React from "react";
import { render, screen } from "@testing-library/react";
import AnimatedEdge from "./AnimatedEdge";

// Deterministic stand-ins for React Flow's path math and render helpers so the
// edge renders in isolation (no <ReactFlow> store). getBezierPath returns
// [path, labelX, labelY]; the stub draws a straight line, so the label lands
// at the midpoint of the edge.
jest.mock("@xyflow/react", () => ({
  // React Flow's BaseEdge takes a `path` prop; map it to the SVG `d`
  // attribute so the mock behaves like the real DOM element.
  BaseEdge: ({ path, ...rest }) => (
    <path data-testid="base-edge" d={path} {...rest} />
  ),
  getBezierPath: ({ sourceX, sourceY, targetX, targetY }) => [
    `M${sourceX},${sourceY} L${targetX},${targetY}`,
    (sourceX + targetX) / 2,
    (sourceY + targetY) / 2,
  ],
  EdgeLabelRenderer: ({ children }) => (
    <div data-testid="edge-label-renderer">{children}</div>
  ),
}));

const baseProps = {
  id: "e1",
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  sourcePosition: "bottom",
  targetPosition: "top",
};

function renderEdge(overrides = {}) {
  return render(<AnimatedEdge {...baseProps} {...overrides} />);
}

describe("AnimatedEdge", () => {
  it("renders the base edge with id, path, and arrowhead marker", () => {
    const { container } = renderEdge();
    const edge = screen.getByTestId("base-edge");
    expect(edge).toHaveAttribute("id", "e1");
    expect(edge).toHaveAttribute("d", "M0,0 L100,100");
    expect(edge).toHaveAttribute("marker-end", "url(#arrowhead-e1)");
    expect(edge.style.strokeWidth).toBe("2.5");
    expect(edge.style.opacity).toBe("1");
    expect(container.querySelector("#arrowhead-e1")).not.toBeNull();
  });

  it("uses a solid stroke by default", () => {
    renderEdge();
    expect(screen.getByTestId("base-edge").style.strokeDasharray).toBe("none");
  });

  it("applies dashed and dotted stroke patterns", () => {
    const { rerender } = render(
      <AnimatedEdge {...baseProps} data={{ kind: "dashed" }} />,
    );
    expect(screen.getByTestId("base-edge").style.strokeDasharray).toBe("8, 4");
    rerender(<AnimatedEdge {...baseProps} data={{ kind: "dotted" }} />);
    expect(screen.getByTestId("base-edge").style.strokeDasharray).toBe("2, 4");
  });

  it("renders the animated dash style and travelling dot for animated edges", () => {
    const { container } = render(
      <AnimatedEdge {...baseProps} data={{ kind: "animated" }} />,
    );
    const edge = screen.getByTestId("base-edge");
    expect(edge.style.strokeDasharray).toBe("10, 10");
    expect(edge.className).toContain("edge-dash-anim");
    const glow = container.querySelector("path.edge-stroke-glow");
    expect(glow).not.toBeNull();
    // strokeWidth is an SVG attribute, not inline CSS
    expect(glow.getAttribute("stroke-width")).toBe("2");
    const dot = container.querySelector("circle");
    expect(dot).not.toBeNull();
    expect(dot.getAttribute("r")).toBe("4");
  });

  it("dims dimmed edges", () => {
    renderEdge({ data: { isDimmed: true } });
    expect(screen.getByTestId("base-edge").style.opacity).toBe("0.12");
  });

  it("renders the label in the label renderer at the edge midpoint", () => {
    const { container } = renderEdge({ label: "calls" });
    const label = screen.getByText("calls");
    expect(label.className).toContain("edge-label");
    // jsdom strips the space after the comma in the transform value
    expect(label.style.transform).toMatch(/translate\(50px, ?-?\d+px\)/);
    expect(container.querySelector("#arrowhead-e1")).not.toBeNull();
  });

  it("skips the label renderer when there is no label", () => {
    const { container } = renderEdge();
    expect(screen.queryByTestId("edge-label-renderer")).toBeNull();
    expect(container.querySelector(".edge-label")).toBeNull();
  });
});
