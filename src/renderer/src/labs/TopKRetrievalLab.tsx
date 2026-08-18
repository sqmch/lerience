import { useEffect, useRef, useState } from "react";
import type { LabProps } from "./types";
import { type V2, cosine, mag } from "./vec";

// ── plane geometry (viewBox units; the SVG scales to its square host) ──
// Mirrors the vectors lab so the two planes read as one family: same range,
// same margins, same origin. A chunk is a *point* here (retrieval ranks the
// corpus by cosine to the query), not an arrow.
const SIZE = 520;
const C = SIZE / 2;
const MARGIN = 44;
const R = 3; // axes run −3 … 3
const GR = 3; // integer gridlines
const SCALE = (C - MARGIN) / R; // px per unit
const SNAP = 0.5;

const toPx = (v: V2) => ({ x: C + v.x * SCALE, y: C - v.y * SCALE });
const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const clamp = (n: number) => Math.min(R, Math.max(-R, n));
const snap = (n: number) => clamp(Math.round(n / SNAP) * SNAP);
const clampPx = (n: number) => Math.min(SIZE - 13, Math.max(13, n));

type Px = { x: number; y: number };
const outward = (px: Px, dist: number): Px => {
  const dx = px.x - C;
  const dy = px.y - C;
  const l = Math.hypot(dx, dy) || 1;
  return { x: clampPx(px.x + (dx / l) * dist), y: clampPx(px.y + (dy / l) * dist) };
};

type Chunk = { text: string; v: V2 };
type Preset = { id: string; label: string; query: V2; k: number };

// Default corpus: a "dev notes" theme, one clearly off-topic cluster (cooking),
// arranged at comparable radius so the plane reads honestly (see the footnote in
// render — real embeddings are usually normalized, so closest-angle ≈ closest-point).
const DEFAULT_AXIS_X = "topic: dev tooling";
const DEFAULT_AXIS_Y = "topic: cooking";
const DEFAULT_QUERY: { text: string; v: V2 } = {
  text: "what port does the dev server use?",
  v: { x: 2.6, y: 0.3 },
};
const DEFAULT_CORPUS: Chunk[] = [
  { text: "dev server runs on port 5173", v: { x: 2.6, y: 0.35 } },
  { text: "Vite is a fast build tool", v: { x: 2.45, y: 0.85 } },
  { text: "production build outputs to dist/", v: { x: 2.5, y: 0.2 } },
  { text: "hot reload on every save", v: { x: 2.4, y: 0.7 } },
  { text: "config lives in vite.config.ts", v: { x: 2.3, y: 1.05 } },
  { text: "env vars load from .env", v: { x: 2.5, y: -0.15 } },
  { text: "deploy to staging via the CLI", v: { x: 2.35, y: -0.4 } },
  { text: "the oven preheats to 220°C", v: { x: 0.3, y: 2.5 } },
  { text: "knead the dough ten minutes", v: { x: 0.45, y: 2.45 } },
  { text: "rest the sauce before serving", v: { x: 0.2, y: 2.4 } },
];
const DEFAULT_PRESETS: Preset[] = [
  { id: "clean", label: "answer up top (k=4)", query: { x: 2.6, y: 0.3 }, k: 4 },
  { id: "junk", label: "k=8 pulls in the off-topic chunk", query: { x: 2.6, y: 0.3 }, k: 8 },
  { id: "miss", label: "vocabulary mismatch — answer buried", query: { x: 1.4, y: 1.9 }, k: 3 },
];
const DEFAULT_FLOOR = 0.35;

export function TopKRetrievalLab(props: LabProps) {
  const cfg = props.config?.topk;
  const axisX = cfg?.axisX ?? DEFAULT_AXIS_X;
  const axisY = cfg?.axisY ?? DEFAULT_AXIS_Y;
  const floor = cfg?.floor ?? DEFAULT_FLOOR;
  const corpus: Chunk[] = cfg?.corpus?.length
    ? cfg.corpus.map((c) => ({ text: c.text, v: { x: c.v[0], y: c.v[1] } }))
    : DEFAULT_CORPUS;
  const queryText = cfg?.query?.text ?? (cfg ? undefined : DEFAULT_QUERY.text);
  const presets: Preset[] = cfg?.presets?.length
    ? cfg.presets.map((p, i) => ({
        id: `c${i}`,
        label: p.label,
        query: { x: p.query[0], y: p.query[1] },
        k: p.k,
      }))
    : DEFAULT_PRESETS;

  const seedQuery = (): V2 => {
    const v = cfg?.query?.v;
    if (v) return { x: v[0], y: v[1] };
    return cfg ? { x: 2.4, y: 0.5 } : { ...DEFAULT_QUERY.v };
  };
  const seedK = () => Math.min(cfg?.k ?? 4, corpus.length);

  const [query, setQuery] = useState<V2>(seedQuery);
  const [k, setK] = useState(seedK);
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // re-seed from the module's config only when the module changes — never clobber
  // the learner's own dragging on a window-focus refetch (mirrors the other labs)
  useEffect(() => {
    setQuery(seedQuery());
    setK(seedK());
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.moduleId]);

  const clientToMath = (clientX: number, clientY: number): V2 => {
    const rect = svgRef.current!.getBoundingClientRect();
    const vbX = ((clientX - rect.left) / rect.width) * SIZE;
    const vbY = ((clientY - rect.top) / rect.height) * SIZE;
    return { x: snap((vbX - C) / SCALE), y: snap((C - vbY) / SCALE) };
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      setQuery(clientToMath(e.clientX, e.clientY));
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

  const hasQuery = mag(query) > 0.001;
  // rank the corpus by cosine to the query — retrieval's core operation
  const ranked = corpus
    .map((chunk, idx) => ({ chunk, idx, score: hasQuery ? cosine(query, chunk.v) : 0 }))
    .sort((a, b) => b.score - a.score);
  const safeK = Math.max(1, Math.min(k, corpus.length));
  const retrieved = ranked.slice(0, safeK);
  const inSet = new Set(retrieved.map((r) => r.idx));
  // per-chunk lookup for the plane: its rank (0-based) and cosine score
  const byIdx = new Map(ranked.map((r, i) => [r.idx, { rank: i, score: r.score }]));

  const topScore = ranked[0]?.score ?? 0;
  const signal = retrieved.filter((r) => r.score >= floor).length; // clears the floor
  const junk = retrieved.length - signal; // below the floor: near-noise in the context
  const tokenEst = safeK * 400; // ≈ tokens the prompt now carries (400/chunk, LESSON 03 §3)

  const coach = (() => {
    if (!hasQuery) return "Drag the query ◆ away from the centre to give it a direction to match.";
    if (topScore < floor)
      return `Nothing clears the ${fmt(floor)} floor. Good retrieval refuses here — it returns "not in your notes" rather than bluff an answer out of near-noise (LESSON §5).`;
    if (junk > 0)
      return `k=${safeK} reaches past the ${signal} chunk${signal === 1 ? "" : "s"} that clear the ${fmt(floor)} floor — the last ${junk} ${junk === 1 ? "is" : "are"} near-noise, padding the prompt and inviting "lost in the middle" (LESSON §4). More isn't more.`;
    return `All ${safeK} retrieved chunks clear the ${fmt(floor)} floor — a clean top-k. Raise k and watch when the off-topic chunk sneaks in.`;
  })();

  // ── plane primitives ──
  const gridLines = [];
  for (let i = -GR; i <= GR; i++) {
    const p = toPx({ x: i, y: i });
    gridLines.push(
      <line key={`v${i}`} className="lab-grid" x1={p.x} y1={MARGIN} x2={p.x} y2={SIZE - MARGIN} />,
      <line key={`h${i}`} className="lab-grid" x1={MARGIN} y1={p.y} x2={SIZE - MARGIN} y2={p.y} />,
    );
  }
  const pxQ = toPx(query);

  return (
    <div className="vlab tklab">
      {/* ── the retrieval plane ── */}
      <div className="vlab-stage">
        <svg
          ref={svgRef}
          className="vlab-svg"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ touchAction: "none" }}
        >
          {gridLines}
          <line className="lab-axis" x1={MARGIN} y1={C} x2={SIZE - MARGIN} y2={C} />
          <line className="lab-axis" x1={C} y1={MARGIN} x2={C} y2={SIZE - MARGIN} />
          <text className="lab-axis-label" x={SIZE - MARGIN} y={C - 8} textAnchor="end">
            {axisX} →
          </text>
          <text className="lab-axis-label" x={C + 8} y={MARGIN + 4}>
            ↑ {axisY}
          </text>

          {/* query direction ray + connectors to each retrieved chunk */}
          {hasQuery && <line className="tk-query-ray" x1={C} y1={C} x2={pxQ.x} y2={pxQ.y} />}
          {hasQuery &&
            retrieved.map((r) => {
              const p = toPx(r.chunk.v);
              return (
                <line
                  key={`conn${r.idx}`}
                  className="tk-conn"
                  x1={pxQ.x}
                  y1={pxQ.y}
                  x2={p.x}
                  y2={p.y}
                />
              );
            })}

          {/* corpus chunks: filled + ranked when retrieved, hollow otherwise */}
          {corpus.map((chunk, idx) => {
            const p = toPx(chunk.v);
            const info = byIdx.get(idx)!;
            const isIn = inSet.has(idx);
            const above = info.score >= floor;
            const tag = outward(p, 15);
            return (
              <g key={`chunk${idx}`} className={`tk-chunk ${isIn ? "in" : "out"}`}>
                <circle className="tk-dot" cx={p.x} cy={p.y} r={5.5} />
                {isIn && (
                  <text className={`tk-rank ${above ? "" : "junk"}`} x={tag.x} y={tag.y}>
                    {info.rank + 1}
                  </text>
                )}
              </g>
            );
          })}

          {/* the draggable query point */}
          <g className="tk-query">
            <circle
              className="lab-grab"
              cx={pxQ.x}
              cy={pxQ.y}
              r={18}
              onPointerDown={(e) => {
                e.preventDefault();
                setTouched(true);
                setDragging(true);
              }}
            />
            <path
              className="tk-query-mark"
              d={`M ${pxQ.x} ${pxQ.y - 8} L ${pxQ.x + 8} ${pxQ.y} L ${pxQ.x} ${pxQ.y + 8} L ${pxQ.x - 8} ${pxQ.y} Z`}
            />
          </g>

          <circle className="lab-origin" cx={C} cy={C} r={2.5} />
          {!touched && (
            <text className="lab-hint" x={C} y={26}>
              drag the query ◆
            </text>
          )}
        </svg>
        <p className="vlab-foot">
          Chunks sit at a similar distance from the origin on purpose: real embeddings are usually
          <strong> normalized</strong> to the same length, so “closest angle” (cosine) and “closest
          point” agree — exactly the move the vectors lab made with <strong>normalize</strong>.
        </p>
      </div>

      {/* ── readout / controls ── */}
      <div className="vlab-panel">
        <section className="vlab-card">
          <div className="vlab-card-head">
            <span>Top match — cosine</span>
            <span className="vlab-big">{hasQuery ? fmt(topScore) : "—"}</span>
          </div>
          <p className="vlab-verdict">
            {!hasQuery
              ? "—"
              : topScore >= floor
                ? `Clears the ${fmt(floor)} floor — retrieval proceeds to the model.`
                : `Below the ${fmt(floor)} floor — retrieval refuses without spending a token.`}
          </p>
        </section>

        <div className="vlab-model">
          Bigger <b>k</b> buys <b>recall</b> — more chance the answer’s chunk is in the set. It
          costs <b>junk</b>: every extra chunk is more tokens, more cost, and more noise the model
          can get lost in.
        </div>

        {coach && <div className="vlab-coach">{coach}</div>}

        <section className="vlab-card clab-knobs">
          <label className="clab-slider">
            <span className="clab-slider-top">
              <span>k — chunks retrieved</span>
              <span className="clab-slider-val">k = {safeK}</span>
            </span>
            <input
              type="range"
              aria-label="k — chunks retrieved"
              min={1}
              max={corpus.length}
              value={safeK}
              onChange={(e) => {
                setTouched(true);
                setK(Number(e.target.value));
              }}
            />
          </label>
          <div className="tk-budget">
            <span className={`tk-budget-pill ${junk > 0 ? "warn" : ""}`}>
              <b>{signal}</b> signal
            </span>
            <span className={`tk-budget-pill ${junk > 0 ? "junk" : ""}`}>
              <b>{junk}</b> junk
            </span>
            <span className="tk-budget-tok">
              ≈ {tokenEst.toLocaleString()} tokens in the prompt
            </span>
          </div>
        </section>

        <section className="vlab-card tk-listcard">
          <div className="vlab-card-head">
            <span>Ranked by cosine</span>
            <span className="tk-floor-key">floor {fmt(floor)}</span>
          </div>
          <ol className="tk-list">
            {ranked.map((r, i) => {
              const isIn = i < safeK;
              const above = r.score >= floor;
              const w = Math.max(0, Math.min(1, r.score)) * 100;
              return (
                <li key={r.idx} className={`tk-row ${isIn ? "in" : "out"} ${above ? "" : "below"}`}>
                  <span className="tk-rank-badge">{i + 1}</span>
                  <span className="tk-text">{r.chunk.text}</span>
                  <span className="tk-bar">
                    <span className="tk-bar-fill" style={{ width: `${w}%` }} />
                    <span className="tk-bar-floor" style={{ left: `${floor * 100}%` }} />
                  </span>
                  <span className="tk-score">{fmt(r.score)}</span>
                  {isIn && i === safeK - 1 && <span className="tk-cut" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
          <p className="tk-list-foot">
            Everything above the line is in the prompt; retrieval always returns k things — the
            scores are what separate signal from filler.
          </p>
        </section>

        <section className="vlab-presets">
          <div className="vlab-presets-label">Try a scenario</div>
          <div className="vlab-presets-row">
            {presets.map((p) => (
              <button
                key={p.id}
                className="vlab-preset"
                onClick={() => {
                  setTouched(true);
                  setQuery(p.query);
                  setK(Math.min(p.k, corpus.length));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {queryText && <p className="tk-query-text">query: “{queryText}”</p>}
      </div>
    </div>
  );
}
