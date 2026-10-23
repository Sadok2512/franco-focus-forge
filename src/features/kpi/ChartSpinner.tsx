// Local loading state for one chart: centred circular spinner, same height as the plot.
export function ChartSpinner({ label }: { label: string }) {
  return (
    <div className="kpi-chart-spinner-box" data-testid="chart-spinner">
      <div className="kpi-chart-spinner" role="status" aria-label={label} />
    </div>
  );
}
