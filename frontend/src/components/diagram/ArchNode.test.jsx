import React from "react";
import { render, screen } from "@testing-library/react";
import ArchNode from "./ArchNode";

// <Handle> reads from the React Flow store, which only exists inside a
// <ReactFlow> tree. These tests render the node in isolation, so stub the
// primitive: Handle becomes a plain element (its only job is to anchor the
// connection dots) and Position stays a stable enum.
jest.mock("@xyflow/react", () => ({
  Handle: ({ position, style }) => (
    <div data-testid={`handle-${position}`} style={style} />
  ),
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

const baseData = {
  label: "API Gateway",
  layer: "api",
  type: "route",
  language: "Python",
  framework: "FastAPI",
  endpoints: [
    { method: "GET", path: "/api/v1/users" },
    { method: "POST", path: "/api/v1/repos" },
  ],
  imports: ["fastapi", "uvicorn", "pydantic"],
};

describe("ArchNode", () => {
  it("renders the label and uppercased type label", () => {
    render(<ArchNode data={baseData} />);
    expect(screen.getByText("API Gateway")).toBeInTheDocument();
    expect(screen.getByText("API ROUTE")).toBeInTheDocument();
  });

  it("renders the language · framework meta line", () => {
    render(<ArchNode data={baseData} />);
    expect(screen.getByText("Python · FastAPI")).toBeInTheDocument();
  });

  it("renders endpoint pills with HTTP method, path, and tooltip", () => {
    const { container } = render(<ArchNode data={baseData} />);
    const pills = container.querySelectorAll(".arch-node-endpoint");
    expect(pills).toHaveLength(2);
    expect(screen.getByText("GET")).toBeInTheDocument();
    expect(screen.getByText("/api/v1/users")).toBeInTheDocument();
    expect(pills[0]).toHaveAttribute("title", "GET /api/v1/users");
  });

  it("caps endpoint pills at four and shows the overflow count", () => {
    const data = {
      ...baseData,
      endpoints: [
        { method: "GET", path: "/a" },
        { method: "POST", path: "/b" },
        { method: "PUT", path: "/c" },
        { method: "DELETE", path: "/d" },
        { method: "PATCH", path: "/e" },
      ],
    };
    const { container } = render(<ArchNode data={data} />);
    expect(container.querySelectorAll(".arch-node-endpoint")).toHaveLength(4);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("renders the import list and the API count", () => {
    render(<ArchNode data={baseData} />);
    expect(screen.getByText("in")).toBeInTheDocument();
    expect(screen.getByText("fastapi, uvicorn, pydantic")).toBeInTheDocument();
    expect(screen.getByText("2 APIs")).toBeInTheDocument();
  });

  it("caps the import list at four and shows the overflow count", () => {
    const data = {
      ...baseData,
      imports: ["a", "b", "c", "d", "e", "f"],
    };
    render(<ArchNode data={data} />);
    expect(screen.getByText("a, b, c, d")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("uses the singular form for a single API", () => {
    render(
      <ArchNode
        data={{
          ...baseData,
          endpoints: [{ method: "GET", path: "/health" }],
        }}
      />,
    );
    expect(screen.getByText("1 API")).toBeInTheDocument();
  });

  it("omits endpoint and import sections when absent", () => {
    const { container } = render(
      <ArchNode data={{ label: "Worker", layer: "backend" }} />,
    );
    expect(container.querySelector(".arch-node-endpoints")).toBeNull();
    expect(container.querySelector(".arch-node-imports")).toBeNull();
    expect(screen.getByText("SERVICE")).toBeInTheDocument();
  });

  it("renders the connection handles at top and bottom", () => {
    render(<ArchNode data={baseData} />);
    expect(screen.getByTestId("handle-top")).toBeInTheDocument();
    expect(screen.getByTestId("handle-bottom")).toBeInTheDocument();
  });

  it("applies the glow shadow when selected and staggers by layerRank", () => {
    const { container, rerender } = render(<ArchNode data={baseData} />);
    const card = container.querySelector(".arch-node-card");
    expect(card.style.boxShadow).toContain("3px 3px 0");
    rerender(<ArchNode data={{ ...baseData, layerRank: 2 }} selected />);
    const selectedCard = container.querySelector(".arch-node-card");
    expect(selectedCard.style.boxShadow).toContain("0 0 30px");
    expect(selectedCard.style.animationDelay).toBe("0.16s");
  });

  it("falls back to infrastructure colors and MODULE for unknown layers", () => {
    render(<ArchNode data={{ label: "Mystery Node" }} />);
    expect(screen.getByText("Mystery Node")).toBeInTheDocument();
    expect(screen.getByText("MODULE")).toBeInTheDocument();
    expect(screen.getByTestId("handle-top")).toBeInTheDocument();
    expect(screen.getByTestId("handle-bottom")).toBeInTheDocument();
  });

  it("infers type labels from the label text and framework", () => {
    const { rerender } = render(
      <ArchNode data={{ label: "User Auth Service", layer: "backend" }} />,
    );
    expect(screen.getByText("AUTH")).toBeInTheDocument();
    // "AppShell" contains no keyword substrings, so the inference falls
    // through to the framework check (react → COMPONENT).
    rerender(
      <ArchNode
        data={{ label: "AppShell", layer: "frontend", framework: "react" }}
      />,
    );
    expect(screen.getByText("COMPONENT")).toBeInTheDocument();
  });

  it("emphasizes the HTTP method with bold weight", () => {
    render(<ArchNode data={baseData} />);
    const method = screen.getByText("GET");
    expect(method.style.fontWeight).toBe("700");
  });

  it("renders the icon when data.icon names a known icon", () => {
    const { container } = render(
      <ArchNode data={{ ...baseData, icon: "Server" }} />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
