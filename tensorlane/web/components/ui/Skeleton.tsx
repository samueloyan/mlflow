export function Skeleton({
  width,
  height = 12,
  className = "",
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ display: "inline-block", width: width ?? "100%", height }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="card">
      <Skeleton width={80} height={10} />
      <div style={{ marginTop: 12 }}>
        <Skeleton width={96} height={28} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Skeleton height={28} />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, index) => (
              <th key={index}>
                <Skeleton height={10} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              {Array.from({ length: cols }).map((__, col) => (
                <td key={col}>
                  <Skeleton height={12} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartSkeleton({ height = 180 }: { height?: number }) {
  return (
    <div className="card">
      <Skeleton width={120} height={12} />
      <div style={{ marginTop: 16 }}>
        <Skeleton height={height} />
      </div>
    </div>
  );
}
