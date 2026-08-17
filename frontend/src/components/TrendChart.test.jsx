import { render, screen, fireEvent } from "@testing-library/react";
import TrendChart from "./TrendChart";

const baseProps = {
  data: [],
  days: 30,
  onDaysChange: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe("TrendChart empty states", () => {
  it("shows analyze message when no data", () => {
    render(<TrendChart {...baseProps} />);
    expect(
      screen.getByText("Analyze this repo to see trends"),
    ).toBeInTheDocument();
  });

  it("shows need 2 analyses message when only 1 data point", () => {
    render(
      <TrendChart
        {...baseProps}
        data={[{ health: { score: 85 }, saved_at: Date.now() / 1000 }]}
      />,
    );
    expect(
      screen.getByText("Need at least 2 analyses for a trend"),
    ).toBeInTheDocument();
  });
});

describe("TrendChart with data", () => {
  const data = [
    {
      health: { score: 75, breakdown: { security: 80, documentation: 70 } },
      saved_at: 1700000000,
      head_sha: "abc1234",
    },
    {
      health: { score: 85, breakdown: { security: 90, documentation: 80 } },
      saved_at: 1700100000,
      head_sha: "def5678",
    },
    {
      health: { score: 92, breakdown: { security: 95, documentation: 88 } },
      saved_at: 1700200000,
      head_sha: "ghi9012",
    },
  ];

  const renderChart = () => {
    render(<TrendChart {...baseProps} data={data} />);
  };

  it("renders SVG chart", () => {
    render(<TrendChart {...baseProps} data={data} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Health score trend over time"),
    ).toBeInTheDocument();
  });

  it("shows HEALTH TREND label", () => {
    render(<TrendChart {...baseProps} data={data} />);
    expect(screen.getByText("HEALTH TREND")).toBeInTheDocument();
  });

  it("shows time filter buttons", () => {
    render(<TrendChart {...baseProps} data={data} />);
    expect(screen.getByText("7d")).toBeInTheDocument();
    expect(screen.getByText("30d")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("calls onDaysChange when filter clicked", () => {
    render(<TrendChart {...baseProps} data={data} />);
    fireEvent.click(screen.getByText("7d"));
    expect(baseProps.onDaysChange).toHaveBeenCalledWith(7);
  });

  it("shows Details toggle button", () => {
    render(<TrendChart {...baseProps} data={data} />);
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  it("toggle Details shows dimension lines", () => {
    render(<TrendChart {...baseProps} data={data} />);
    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByText("Hide Details")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
  });

  it("renders data points as circles", () => {
    renderChart();
    expect(screen.getAllByTestId("trend-point")).toHaveLength(3);
  });

  it("hovering shows tooltip with score", () => {
    renderChart();
    fireEvent.mouseEnter(screen.getAllByTestId("trend-point")[0]);
    expect(screen.getByText(/75\/100/)).toBeInTheDocument();
  });

  it("renders main polyline", () => {
    renderChart();
    expect(screen.getAllByTestId("trend-line-main")).toHaveLength(1);
  });

  it("shows dimension lines in SVG when details toggled", () => {
    render(<TrendChart {...baseProps} data={data} />);
    fireEvent.click(screen.getByText("Details"));
    expect(screen.getAllByTestId("trend-line-dim").length).toBeGreaterThan(0);
  });
});
