// Real React port of the prototype `spark()` SVG helper.
export default function Sparkline({ data, w = 74, h = 30, stroke = "var(--cobalt)", fill = false }) {
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const rng = mx - mn || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - mn) / rng) * (h - 4) - 2,
  ]);
  const d = pts
    .map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} fill="none">
      {fill && <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={stroke} opacity=".07" />}
      <path d={d} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
