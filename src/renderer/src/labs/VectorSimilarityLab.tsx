import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LabProps } from "./types";
import { type V2, dot, mag, normalize, cosine, euclidean, angleDeg, heading } from "./vec";

// ── plane geometry (all in viewBox units; SVG scales to its square host) ──
const SIZE = 520;
const C = SIZE / 2;
const MARGIN = 44;
const R = 3; // axes run −3 … 3 (a smaller range → a bigger, legible unit circle)
const GR = 3; // integer gridlines
const SCALE = (C - MARGIN) / R; // px per unit
const SNAP = 0.5;

const toPx = (v: V2) => ({ x: C + v.x * SCALE, y: C - v.y * SCALE });
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const sfmt = (n: number) => (n >= 0 ? `+${fmt(n)}` : fmt(n));
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

type Preset = { id: string; label: string; a: V2; b: V2; aText?: string; bText?: string };
const DEFAULT_PRESETS: Preset[] = [
  { id: "similar", label: "Near-duplicate", a: { x: 2.5, y: 1.5 }, b: { x: 2.5, y: 1 } },
  { id: "ortho", label: "Unrelated (90°)", a: { x: 2.5, y: 0.5 }, b: { x: -0.5, y: 2.5 } },
  { id: "opposite", label: "Opposite", a: { x: 2, y: 1.5 }, b: { x: -2, y: -1.5 } },
  { id: "collinear", label: "Same way, diff. length", a: { x: 1, y: 1.5 }, b: { x: 2, y: 3 } },
];

function verdict(c: number): string {
  if (c > 0.985) return "Pointing the same way — basically identical direction.";
  if (c > 0.8) return "Pointing almost the same way — very similar.";
  if (c > 0.3) return "Leaning the same way — somewhat related.";
  if (c > -0.3) return "At roughly a right angle — unrelated.";
  if (c > -0.8) return "Leaning opposite ways.";
  return "Pointing opposite ways — opposite direction.";
}

function shortDelta(a: V2, b: V2): number {
  let d = heading(b) - heading(a);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function sectorPoints(a: V2, b: V2): string {
  const r = 46;
  const start = heading(a);
  const delta = shortDelta(a, b);
  const pts = [`${C},${C}`];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const ang = start + (delta * i) / steps;
    pts.push(`${C + r * Math.cos(ang)},${C - r * Math.sin(ang)}`);
  }
  return pts.join(" ");
}

function head(tip: Px): string {
  const dx = tip.x - C;
  const dy = tip.y - C;
  const len = Math.hypot(dx, dy);
  if (len < 6) return "";
  const ux = dx / len;
  const uy = dy / len;
  const h = 13;
  const w = 5.5;
  const bx = tip.x - ux * h;
  const by = tip.y - uy * h;
  return [
    `${tip.x},${tip.y}`,
    `${bx - uy * w},${by + ux * w}`,
    `${bx + uy * w},${by - ux * w}`,
  ].join(" ");
}

function Toggle(props: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`lab-toggle ${props.on ? "on" : ""}`}
      onClick={props.onClick}
      aria-pressed={props.on}
    >
      <span className="lab-toggle-dot" />
      {props.children}
    </button>
  );
}

/** Diverging bar: agreement extends right, conflict extends left of centre. */
function AgreeBar(props: { value: number; max: number }) {
  const w = (Math.min(Math.abs(props.value), props.max) / (props.max || 1)) * 50;
  const pos = props.value >= 0;
  return (
    <div className="agree-bar">
      <span className="agree-mid" />
      <span
        className={`agree-fill ${pos ? "pos" : "neg"}`}
        style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
      />
    </div>
  );
}

/** Ease a V2 toward its target over ~260ms; snaps instantly when `immediate`. */
function useTween(tx: number, ty: number, immediate: boolean): V2 {
  const [val, setVal] = useState<V2>({ x: tx, y: ty });
  const from = useRef<V2>({ x: tx, y: ty });
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (immediate) {
      from.current = { x: tx, y: ty };
      setVal({ x: tx, y: ty });
      return;
    }
    const f = { ...from.current };
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 260);
      const e = 1 - Math.pow(1 - t, 3);
      const cur = { x: f.x + (tx - f.x) * e, y: f.y + (ty - f.y) * e };
      from.current = cur;
      setVal(cur);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [tx, ty, immediate]);
  return val;
}

export function VectorSimilarityLab(props: LabProps) {
  const cfg = props.config?.vectors;
  const axisX = cfg?.axisX ?? "x-axis";
  const axisY = cfg?.axisY ?? "y-axis";
  const aRole = cfg?.a?.role ?? "Vector A";
  const bRole = cfg?.b?.role ?? "Vector B";
  const presets: Preset[] =
    cfg?.presets?.map((p, i) => ({
      id: `c${i}`,
      label: p.label,
      a: { x: p.a[0], y: p.a[1] },
      b: { x: p.b[0], y: p.b[1] },
      aText: p.aText,
      bText: p.bText,
    })) ?? DEFAULT_PRESETS;

  const [rawA, setRawA] = useState<V2>({ x: 2, y: 1 });
  const [rawB, setRawB] = useState<V2>({ x: 1, y: 2 });
  // example texts derive from config each render (so a mid-session lab.json
  // edit shows up on the next course fetch); a preset click overrides them
  // until the module changes
  const [textOverride, setTextOverride] = useState<{ a?: string; b?: string } | null>(null);
  const aText = textOverride ? textOverride.a : cfg?.a?.text;
  const bText = textOverride ? textOverride.b : cfg?.b?.text;
  const [normalized, setNormalized] = useState(false);
  const [showDistance, setShowDistance] = useState(false);
  const [showProj, setShowProj] = useState(false);
  const [dragging, setDragging] = useState<"A" | "B" | null>(null);
  const [touched, setTouched] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // re-seed from the module's config when the module changes (not on every render,
  // so window-focus refetches and the learner's own drags are never clobbered)
  useEffect(() => {
    const v = props.config?.vectors;
    if (v?.a?.v) setRawA({ x: v.a.v[0], y: v.a.v[1] });
    if (v?.b?.v) setRawB({ x: v.b.v[0], y: v.b.v[1] });
    setTextOverride(null);
    setNormalized(false);
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.moduleId]);

  const A = normalized ? normalize(rawA) : rawA;
  const B = normalized ? normalize(rawB) : rawB;
  const drag = dragging !== null;
  const viewA = useTween(A.x, A.y, drag);
  const viewB = useTween(B.x, B.y, drag);

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
      const v = clientToMath(e.clientX, e.clientY);
      (dragging === "A" ? setRawA : setRawB)(v);
    };
    const up = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

  // numbers from targets (authoritative)
  const c = cosine(A, B);
  const mA = mag(A);
  const mB = mag(B);
  const d = dot(A, B);
  const dist = euclidean(A, B);
  const ang = angleDeg(A, B);
  const hasLen = mA > 0.001 && mB > 0.001;
  const projLen = mA > 0.001 ? d / mA : 0;

  // per-axis agreement breakdown
  const prod: [number, number] = [A.x * B.x, A.y * B.y];
  const maxAbs = Math.max(Math.abs(prod[0]), Math.abs(prod[1]), Math.abs(d), 0.0001);
  const axisRows = [
    { label: axisX, a: A.x, b: B.x, p: prod[0] },
    { label: axisY, a: A.y, b: B.y, p: prod[1] },
  ];

  // drawing from animated view vectors
  const pxA = toPx(viewA);
  const pxB = toPx(viewB);
  const vMagA = mag(viewA);
  const uA = vMagA > 0.001 ? { x: viewA.x / vMagA, y: viewA.y / vMagA } : { x: 0, y: 0 };
  const vProj = dot(viewB, uA);
  const pxProj = toPx({ x: uA.x * vProj, y: uA.y * vProj });

  const coach = (() => {
    if (!hasLen) return "Give both arrows some length — drag a tip away from the centre.";
    if (normalized)
      return "Both tips now sit on the circle: every arrow is length 1, so distance and cosine finally rank things the same way.";
    if (c > 0.985 && Math.abs(mA - mB) > 0.6)
      return "Same direction, different lengths. Cosine already reads ~1.00, yet the tip-to-tip distance is large — distance got fooled by length. Hit “normalize” and watch it collapse.";
    if (Math.abs(c) < 0.08) return "Right angle → cosine ≈ 0. In RAG terms: unrelated.";
    if (c < -0.6)
      return "Opposite direction. Careful: opposite direction ≠ opposite meaning — real embeddings rarely go truly negative.";
    return null;
  })();

  const gridLines = [];
  for (let i = -GR; i <= GR; i++) {
    const p = toPx({ x: i, y: i });
    gridLines.push(
      <line key={`v${i}`} className="lab-grid" x1={p.x} y1={MARGIN} x2={p.x} y2={SIZE - MARGIN} />,
      <line key={`h${i}`} className="lab-grid" x1={MARGIN} y1={p.y} x2={SIZE - MARGIN} y2={p.y} />,
    );
  }

  const aMid = heading(viewA) + shortDelta(viewA, viewB) / 2;
  const angLabel = { x: C + 62 * Math.cos(aMid), y: C - 62 * Math.sin(aMid) };
  const gapMid = { x: (pxA.x + pxB.x) / 2, y: (pxA.y + pxB.y) / 2 };
  const gdx = pxB.x - pxA.x;
  const gdy = pxB.y - pxA.y;
  const gl = Math.hypot(gdx, gdy) || 1;
  const gap = { x: gapMid.x - (gdy / gl) * 16, y: gapMid.y + (gdx / gl) * 16 };

  return (
    <div className="vlab">
      {/* ── the plane ── */}
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

          {/* axis meaning labels */}
          <text className="lab-axis-label" x={SIZE - MARGIN} y={C - 8} textAnchor="end">
            {axisX} →
          </text>
          <text className="lab-axis-label" x={C + 8} y={MARGIN + 4}>
            ↑ {axisY}
          </text>

          {/* unit circle — length 1 */}
          <circle className={`lab-unit ${normalized ? "active" : ""}`} cx={C} cy={C} r={SCALE} />
          <text className="lab-unit-label" x={C} y={C + SCALE + 15} textAnchor="middle">
            length 1
          </text>

          {hasLen && (
            <>
              <polygon className="lab-sector" points={sectorPoints(viewA, viewB)} />
              <text className="lab-angle-label" x={angLabel.x} y={angLabel.y}>
                {Math.round(ang)}°
              </text>
            </>
          )}

          {showProj && hasLen && (
            <>
              <line className="lab-proj-along" x1={C} y1={C} x2={pxProj.x} y2={pxProj.y} />
              <line className="lab-proj" x1={pxB.x} y1={pxB.y} x2={pxProj.x} y2={pxProj.y} />
              <circle className="lab-proj-dot" cx={pxProj.x} cy={pxProj.y} r={3} />
            </>
          )}

          {showDistance && hasLen && (
            <>
              <line className="lab-dist" x1={pxA.x} y1={pxA.y} x2={pxB.x} y2={pxB.y} />
              <text className="lab-dist-label" x={gap.x} y={gap.y}>
                gap {fmt(dist)}
              </text>
            </>
          )}

          {(["A", "B"] as const).map((key) => {
            const view = key === "A" ? viewA : viewB;
            const px = key === "A" ? pxA : pxB;
            const tag = outward(px, 20);
            const lab = outward(px, 36);
            return (
              <g key={key} className={`lab-vec lab-vec-${key.toLowerCase()}`}>
                <line x1={C} y1={C} x2={px.x} y2={px.y} className="lab-vec-line" />
                {head(px) && <polygon points={head(px)} className="lab-vec-head" />}
                <circle
                  className="lab-grab"
                  cx={px.x}
                  cy={px.y}
                  r={18}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setTouched(true);
                    setDragging(key);
                  }}
                />
                <circle className="lab-handle" cx={px.x} cy={px.y} r={6} />
                <text className="lab-vec-tag" x={tag.x} y={tag.y}>
                  {key}
                </text>
                {mag(view) > 0.001 && (
                  <text className="lab-vec-mag" x={lab.x} y={lab.y}>
                    {fmt(mag(view))}
                  </text>
                )}
              </g>
            );
          })}

          <circle className="lab-origin" cx={C} cy={C} r={2.5} />
          {!touched && (
            <text className="lab-hint" x={C} y={26}>
              drag either tip ●
            </text>
          )}
        </svg>
        <p className="vlab-foot">
          Drawn in 2-D so you can see it. Real embeddings carry <strong>384</strong> numbers — same
          math, more axes than anyone can picture. The feel you get here is the real thing.
        </p>
      </div>

      {/* ── readout / controls ── */}
      <div className="vlab-panel">
        <section className="vlab-card">
          <div className="vlab-card-head">
            <span>Cosine similarity</span>
            <span className="vlab-big">{hasLen ? fmt(c) : "—"}</span>
          </div>
          <div className="vlab-gauge">
            <div className="vlab-gauge-track" />
            <div
              className="vlab-gauge-marker"
              style={{ left: `${((Math.min(1, Math.max(-1, c)) + 1) / 2) * 100}%` }}
            />
          </div>
          <div className="vlab-gauge-scale">
            <span>−1 opposite</span>
            <span>0 unrelated</span>
            <span>1 identical</span>
          </div>
          <p className="vlab-verdict">{hasLen ? verdict(c) : "—"}</p>
        </section>

        <div className="vlab-model">
          <b>Dot product</b> = how much the two arrows agree, with longer arrows counting for more.{" "}
          <b>Cosine</b> = that same agreement, but size-blind — squeezed onto a −1…1 scale.
        </div>

        {coach && <div className="vlab-coach">{coach}</div>}

        {/* the dot-product demystifier */}
        <section className="vlab-card vlab-agree">
          <div className="vlab-card-head">
            <span>Dot product, built up</span>
            <span className="vlab-big">{fmt(d)}</span>
          </div>
          <p className="vlab-agree-intro">
            On each axis, multiply A's number by B's. Same sign → they <b>agree</b> (bar goes
            right); opposite signs → they <b>disagree</b> (bar goes left). Add the axes up.
          </p>
          {axisRows.map((row, i) => (
            <div className="vlab-agree-row" key={i}>
              <div className="vlab-agree-top">
                <span className="vlab-agree-axis">{row.label}</span>
                <span className="vlab-agree-calc">
                  {fmt(row.a)} × {fmt(row.b)} = <b>{sfmt(row.p)}</b>
                </span>
              </div>
              <AgreeBar value={row.p} max={maxAbs} />
            </div>
          ))}
          <div className="vlab-agree-total">
            <div className="vlab-agree-top">
              <span className="vlab-agree-axis">total → dot product</span>
              <span className="vlab-agree-calc">
                <b>{sfmt(d)}</b>
              </span>
            </div>
            <AgreeBar value={d} max={maxAbs} />
          </div>
          <p className="vlab-agree-foot">
            Cosine rescales this to −1…1 by dividing out the lengths: {fmt(d)} ÷ ({fmt(mA)} ×{" "}
            {fmt(mB)}) = <b>{hasLen ? fmt(c) : "—"}</b>.
          </p>
        </section>

        <section className="vlab-card">
          <div className="vlab-readout">
            <div className="vlab-row">
              <span className="k">{aRole}</span>
              <span className="val">
                [{fmt(A.x)}, {fmt(A.y)}]
              </span>
            </div>
            {aText && <div className="vlab-rowsub">“{aText}”</div>}
            <div className="vlab-row">
              <span className="k">{bRole}</span>
              <span className="val">
                [{fmt(B.x)}, {fmt(B.y)}]
              </span>
            </div>
            {bText && <div className="vlab-rowsub">“{bText}”</div>}
            <div className="vlab-row">
              <span className="k">Length of A · Length of B</span>
              <span className="val">
                {fmt(mA)} · {fmt(mB)}
              </span>
            </div>
            <div className="vlab-row">
              <span className="k">Angle between</span>
              <span className="val">{hasLen ? `${Math.round(ang)}°` : "—"}</span>
            </div>
            <div className="vlab-row">
              <span className="k">Tip-to-tip distance</span>
              <span className="val">{fmt(dist)}</span>
            </div>
          </div>
        </section>

        {/* the two-meanings-of-length card — the crux */}
        <section className="vlab-card vlab-duality">
          <div className="vlab-duality-head">“Length” means two different things</div>
          <div className="vlab-duality-row">
            <span className="n">2</span>
            <div>
              <b>components</b> — A is [{fmt(A.x)}, {fmt(A.y)}], that's 2 numbers.
              <span className="sub">
                its dimensionality · what <code>a.length</code> checks
              </span>
            </div>
          </div>
          <div className="vlab-duality-row">
            <span className="n">{fmt(mA)}</span>
            <div>
              <b>arrow length</b> — A measures {fmt(mA)} long.
              <span className="sub">its magnitude · ‖A‖ · what normalizing changes</span>
            </div>
          </div>
          <p className="vlab-duality-foot">
            {normalized
              ? "Normalized — every arrow length is now 1.00, so cosine = the bare dot product."
              : "Cosine ignores arrow length entirely. Normalizing forces it to exactly 1."}
          </p>
        </section>

        <section className="vlab-controls">
          <Toggle on={normalized} onClick={() => setNormalized((s) => !s)}>
            normalize both to length 1
          </Toggle>
          <Toggle on={showProj} onClick={() => setShowProj((s) => !s)}>
            show dot-product projection
          </Toggle>
          {showProj && hasLen && (
            <p className="vlab-note">
              Geometric view: dot = length of A × how far B reaches along it = <b>{fmt(mA)}</b> ×{" "}
              <b>{fmt(projLen)}</b> = <b>{fmt(d)}</b>.
            </p>
          )}
          <Toggle on={showDistance} onClick={() => setShowDistance((s) => !s)}>
            show tip-to-tip distance
          </Toggle>
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
                  setRawA(p.a);
                  setRawB(p.b);
                  setTextOverride({ a: p.aText, b: p.bText });
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
