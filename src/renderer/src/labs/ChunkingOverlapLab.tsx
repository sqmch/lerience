import { useEffect, useMemo, useState } from "react";
import type { LabProps } from "./types";
import { Icon } from "./ui";

// ── chunking plumbing (words stand in for tokens, exactly as LESSON 02 §3) ──
//
// NOTE (prime directive): this fixed-stride windowing is the *intuition*, drawn
// in words for legibility. It is NOT the curriculum's `chunk(text, {size, overlap})`
// over real tokens that the learner writes and gets checks to pass on — different
// granularity, different edge-handling (degenerate tails, structure-awareness).

interface Range {
  start: number;
  end: number;
}

const DEFAULT_TEXT = "The dev server runs on port 5173 by default in Vite";
// the default presets promise split/survive outcomes, so the default text must
// carry a tracked fact even when no module config is present
const DEFAULT_FACT_SPAN: [number, number] = [3, 7]; // "runs on port 5173"
const DEFAULT_FACT_LABEL = "runs on port 5173";
const DEFAULT_PRESETS = [
  { label: "no overlap — fact splits", size: 5, overlap: 0 },
  { label: "overlap 2 — fact survives", size: 5, overlap: 2 },
  { label: "tiny chunks — fragments", size: 2, overlap: 1 },
  { label: "one huge chunk — diluted", size: 11, overlap: 0 },
];

/** Fixed-size windows stepping by (size − overlap); every token covered, last clamped. */
function chunkRanges(n: number, size: number, overlap: number): Range[] {
  const stride = Math.max(1, size - overlap);
  const out: Range[] = [];
  for (let start = 0; start < n; start += stride) {
    const end = Math.min(start + size, n);
    out.push({ start, end });
    if (end >= n) break;
  }
  return out;
}

export function ChunkingOverlapLab(props: LabProps) {
  const cfg = props.config?.chunking;
  const usingDefaultText = cfg?.text == null;
  const text = cfg?.text ?? DEFAULT_TEXT;
  const tokens = useMemo(() => text.trim().split(/\s+/), [text]);
  const n = tokens.length;
  // fall back to the built-in fact only alongside the built-in text — a custom
  // text without a factSpan genuinely has no fact to track
  const factSpan = cfg?.factSpan ?? (usingDefaultText ? DEFAULT_FACT_SPAN : undefined);
  const fs = factSpan?.[0];
  const fe = factSpan?.[1];
  const hasFact = fs != null && fe != null;
  const factLabel = cfg?.factLabel ?? (usingDefaultText ? DEFAULT_FACT_LABEL : undefined);
  const presets = cfg?.presets ?? DEFAULT_PRESETS;

  const [size, setSize] = useState(Math.min(cfg?.size ?? 5, n));
  const [overlap, setOverlap] = useState(cfg?.overlap ?? 2);

  // re-seed from the module's config only when the module changes — never clobber
  // the learner's own dragging on a window-focus refetch (mirrors the vector lab)
  useEffect(() => {
    setSize(Math.min(cfg?.size ?? 5, tokens.length));
    setOverlap(cfg?.overlap ?? 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.moduleId]);

  const safeSize = Math.max(1, Math.min(size, n));
  const safeOverlap = Math.max(0, Math.min(overlap, safeSize - 1));
  const stride = Math.max(1, safeSize - safeOverlap);
  const chunks = useMemo(() => chunkRanges(n, safeSize, safeOverlap), [n, safeSize, safeOverlap]);

  const totalCovered = chunks.reduce((s, c) => s + (c.end - c.start), 0);
  const duplicated = totalCovered - n;
  const dupPct = n > 0 ? Math.round((duplicated / n) * 100) : 0;

  const owners = hasFact
    ? chunks.reduce<number[]>((acc, c, i) => {
        if (c.start <= fs! && c.end >= fe!) acc.push(i);
        return acc;
      }, [])
    : [];
  const factSplit = hasFact && owners.length === 0;

  const coach = (() => {
    if (factSplit)
      return `The fact “${factLabel}” straddles a boundary — no single chunk holds it whole, so a query for it pulls back a half-answer. Raise overlap until one bar turns solid.`;
    if (hasFact && owners.length) {
      const factLen = fe! - fs!;
      const smallestOwner = Math.min(...owners.map((i) => chunks[i]!.end - chunks[i]!.start));
      // intact but drowning: the picture alone would call this a win, so the
      // coach has to carry the dilution half of the lesson (LESSON 02 §3)
      if (smallestOwner >= factLen * 2.5)
        return `The fact “${factLabel}” is intact — but its chunk carries ${smallestOwner} tokens for a ${factLen}-token fact. The chunk's single vector is the *average* of everything in it, so the fact's signal gets diluted toward mush: a solid bar is not automatically a good chunk.`;
      return `The fact “${factLabel}” survives intact in chunk ${owners
        .map((i) => i + 1)
        .join(", ")} — that's what overlap buys, at a cost of ${duplicated} duplicated token${
        duplicated === 1 ? "" : "s"
      }.`;
    }
    return `Stride = size − overlap = ${stride}: each chunk begins ${stride} token${
      stride === 1 ? "" : "s"
    } after the previous one.`;
  })();

  return (
    <div className="clab">
      {/* ── the windowing picture ── */}
      <div className="clab-stage">
        <p className="clab-intro">
          A document is sliced into fixed-size <b>chunks</b> that <b>overlap</b> by a few tokens;
          each chunk is embedded as one vector. Move the knobs and watch the boundaries shift — and
          whether a fact lands inside a single chunk or gets cut in half.
        </p>

        <div
          className="clab-grid"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(30px, 1fr))` }}
        >
          {hasFact && (
            <div
              className="clab-fact-band"
              style={{ gridColumn: `${fs! + 1} / ${fe! + 1}`, gridRow: `1 / ${chunks.length + 2}` }}
            />
          )}
          {tokens.map((t, i) => {
            const inFact = hasFact && i >= fs! && i < fe!;
            return (
              <div
                key={`t${i}`}
                className={`clab-tok${inFact ? " fact" : ""}`}
                style={{ gridColumn: i + 1, gridRow: 1 }}
              >
                <span className="clab-tok-idx">{i}</span>
                <span className="clab-tok-word">{t}</span>
              </div>
            );
          })}
          {chunks.map((c, ci) => {
            const full = hasFact && c.start <= fs! && c.end >= fe!;
            const touches = hasFact && c.end > fs! && c.start < fe!;
            return (
              <div
                key={`c${ci}`}
                className={`clab-bar${full ? " full" : touches ? " partial" : ""}`}
                style={{ gridColumn: `${c.start + 1} / ${c.end + 1}`, gridRow: ci + 2 }}
              >
                <span className="clab-bar-label">chunk {ci + 1}</span>
                <span className="clab-bar-meta">
                  {c.end - c.start} tok
                  {full && (
                    <>
                      {" · fact"}
                      <Icon name="check" size="xs" />
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <div className="clab-legend">
          <span className="clab-leg full">solid · chunk holds the fact whole</span>
          <span className="clab-leg partial">hatched · only part of the fact</span>
          {hasFact && <span className="clab-leg fact">band · the tracked fact</span>}
        </div>

        <div className="clab-coach">{coach}</div>

        <p className="clab-foot">
          Words stand in for tokens so you can read them; a real tokenizer splits sub-words, but the
          size/overlap intuition is identical. Sane starting points — size ≈ 200–400 tokens, overlap
          ≈ 10–15% — are <em>defaults to beat with measurement</em> (module 04), not truths.
        </p>
      </div>

      {/* ── knobs + readout ── */}
      <div className="clab-panel">
        <section className="vlab-card clab-knobs">
          <div className="vlab-card-head">
            <span>Chunks produced</span>
            <span className="vlab-big">{chunks.length}</span>
          </div>
          <label className="clab-slider">
            <span className="clab-slider-top">
              <span>chunk size</span>
              <span className="clab-slider-val">{safeSize} tok</span>
            </span>
            {/* The visible label carries a live value, so the slider is named
                explicitly: without this its accessible name folds the readout in
                and a screen reader says "chunk size 5 tok, 5". */}
            <input
              type="range"
              aria-label="chunk size"
              min={1}
              max={n}
              value={safeSize}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </label>
          <label className="clab-slider">
            <span className="clab-slider-top">
              <span>overlap</span>
              <span className="clab-slider-val">{safeOverlap} tok</span>
            </span>
            <input
              type="range"
              aria-label="overlap"
              min={0}
              max={Math.max(0, safeSize - 1)}
              value={safeOverlap}
              onChange={(e) => setOverlap(Number(e.target.value))}
            />
          </label>
        </section>

        <section className="vlab-card">
          <div className="vlab-readout">
            <div className="vlab-row">
              <span className="k">document</span>
              <span className="val">{n} tokens</span>
            </div>
            <div className="vlab-row">
              <span className="k">stride (size − overlap)</span>
              <span className="val">{stride}</span>
            </div>
            <div className="vlab-row">
              <span className="k">duplicated tokens</span>
              <span className="val">
                {duplicated} ({dupPct}% extra)
              </span>
            </div>
            {hasFact && (
              <div className="vlab-row">
                <span className="k">fact intact in</span>
                <span className="val">
                  {factSplit ? "— none" : `chunk ${owners.map((i) => i + 1).join(", ")}`}
                </span>
              </div>
            )}
          </div>
        </section>

        <div className="vlab-model">
          <b>Size</b> trades context for precision: too big and the vector is a diluted average of
          many topics; too small and a chunk loses the context that made it meaningful.{" "}
          <b>Overlap</b> is insurance against facts that fall on a boundary — paid for in duplicated
          storage.
        </div>

        <section className="clab-presets">
          <div className="vlab-presets-label">Try a setting</div>
          <div className="vlab-presets-row">
            {presets.map((p, i) => (
              <button
                key={i}
                className="vlab-preset"
                onClick={() => {
                  setSize(p.size);
                  setOverlap(p.overlap);
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
