import { useEffect, useState } from "react";
import type { LabProps } from "./types";
import type { RankedItem } from "./types";
import { Tooltip } from "./ui";

// ── the golden-set idea, made kinesthetic ──
//
// A ranked retrieval list with each result marked relevant / irrelevant (the
// golden-set truth, LESSON 04 §2). A cutoff k splits the ranking into
// "retrieved" (top k) and "left behind". Slide it and watch the two numbers
// pull against each other: recall climbs, precision decays.

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const pct = (n: number) => `${Math.round(n * 100)}%`;

// Default golden set: one question ("what port does the dev server use?") against
// a small notes corpus, best-first, four genuinely relevant chunks scattered so
// the tradeoff is visible.
const DEFAULT_ITEMS: RankedItem[] = [
  { text: "notes/vite.md — the dev server runs on port 5173", relevant: true },
  { text: "notes/vite.md — Vite dev server overview", relevant: true },
  { text: "notes/deploy.md — production build to dist/", relevant: false },
  { text: "notes/vite.md — hot reload on every save", relevant: true },
  { text: "notes/recipes.md — preheat the oven to 220°C", relevant: false },
  { text: "notes/deploy.md — staging deploy via the CLI", relevant: false },
  { text: "notes/vite.md — config in vite.config.ts", relevant: true },
  { text: "notes/readme.md — project introduction", relevant: false },
  { text: "notes/recipes.md — knead the dough ten minutes", relevant: false },
  { text: "notes/env.md — .env variable loading", relevant: false },
  { text: "notes/misc.md — this week's todo list", relevant: false },
];

const R = (text: string): RankedItem => ({ text, relevant: true });
const I = (text: string): RankedItem => ({ text, relevant: false });

const DEFAULT_PRESETS = [
  {
    label: "clean retriever — relevant up top",
    cutoff: 4,
    items: [
      R("notes/vite.md — dev server on port 5173"),
      R("notes/vite.md — Vite dev server overview"),
      R("notes/vite.md — hot reload on every save"),
      R("notes/vite.md — config in vite.config.ts"),
      I("notes/deploy.md — production build to dist/"),
      I("notes/recipes.md — preheat the oven to 220°C"),
      I("notes/readme.md — project introduction"),
      I("notes/misc.md — this week's todo list"),
    ],
  },
  {
    label: "leaky — relevant scattered deep",
    cutoff: 8,
    items: [
      I("notes/readme.md — project introduction"),
      I("notes/recipes.md — preheat the oven to 220°C"),
      R("notes/vite.md — dev server on port 5173"),
      I("notes/deploy.md — production build to dist/"),
      I("notes/misc.md — this week's todo list"),
      R("notes/vite.md — Vite dev server overview"),
      I("notes/recipes.md — knead the dough"),
      I("notes/env.md — .env variable loading"),
      R("notes/vite.md — hot reload on save"),
      I("notes/deploy.md — staging deploy via CLI"),
      R("notes/vite.md — config in vite.config.ts"),
    ],
  },
  {
    label: "one answer, buried deep",
    cutoff: 5,
    items: [
      I("notes/readme.md — project introduction"),
      I("notes/recipes.md — preheat the oven to 220°C"),
      I("notes/deploy.md — production build to dist/"),
      I("notes/misc.md — this week's todo list"),
      I("notes/env.md — .env variable loading"),
      I("notes/deploy.md — staging deploy via CLI"),
      I("notes/recipes.md — knead the dough"),
      I("notes/readme.md — install steps"),
      R("notes/vite.md — the dev server runs on port 5173"),
      I("notes/misc.md — meeting notes"),
    ],
  },
];

export function PrecisionRecallLab(props: LabProps) {
  const cfg = props.config?.["precision-recall"];
  const items: RankedItem[] = cfg?.items?.length ? cfg.items : DEFAULT_ITEMS;
  const presets = cfg?.presets?.length ? cfg.presets : DEFAULT_PRESETS;
  const n = items.length;

  // a preset can swap the whole ranking; local override wins until the module changes
  const [override, setOverride] = useState<RankedItem[] | null>(null);
  const list = override ?? items;
  const m = list.length;
  const relevantTotal = list.filter((it) => it.relevant).length;

  const [cutoff, setCutoff] = useState(() => Math.min(cfg?.cutoff ?? Math.round(n / 2), n));

  // re-seed only when the module changes — never clobber a learner's own dragging
  useEffect(() => {
    setOverride(null);
    setCutoff(Math.min(cfg?.cutoff ?? Math.round(items.length / 2), items.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.moduleId]);

  const k = Math.max(0, Math.min(cutoff, m));
  const retrieved = list.slice(0, k);
  const hits = retrieved.filter((it) => it.relevant).length; // true positives
  const falseAlarms = retrieved.length - hits; // false positives
  const misses = relevantTotal - hits; // false negatives
  const precision = k > 0 ? hits / k : null; // hits / retrieved
  const recall = relevantTotal > 0 ? hits / relevantTotal : null; // hits / relevant
  const firstRelevant = list.findIndex((it) => it.relevant); // 0-based, −1 if none

  const coach = (() => {
    if (relevantTotal === 0) return "This ranking has no relevant docs — recall is undefined.";
    if (k === 0)
      return "Cutoff at 0: you've retrieved nothing. Recall is 0; there's nothing to be precise about.";
    if (k >= m)
      return `Cutoff at the bottom: recall is a perfect ${fmt(recall ?? 0)} — but precision bottoms out at ${fmt(
        precision ?? 0,
      )}. Retrieving everything isn't retrieval.`;
    if (recall === 1)
      return `Every relevant doc is in (recall ${fmt(recall)}). Tightening the cutoff now only raises precision — you'd drop noise, not answers.`;
    if (precision === 1)
      return `Everything retrieved is relevant (precision 1.00) — but you're still missing ${misses} relevant doc${
        misses === 1 ? "" : "s"
      }. Slide right for recall, and precision starts to pay for it.`;
    return `Cutoff ${k}: recall ${fmt(recall ?? 0)} (${hits}/${relevantTotal} found), precision ${fmt(
      precision ?? 0,
    )} (${hits}/${k} retrieved are hits). Slide right — recall climbs, precision decays.`;
  })();

  const applyPreset = (p: { items?: RankedItem[]; cutoff?: number }) => {
    if (p.items) {
      setOverride(p.items);
      setCutoff(Math.min(p.cutoff ?? Math.round(p.items.length / 2), p.items.length));
    } else if (p.cutoff != null) {
      setCutoff(Math.min(p.cutoff, m));
    }
  };

  return (
    <div className="clab prlab">
      {/* ── the ranked list + cutoff ── */}
      <div className="clab-stage">
        <p className="clab-intro">
          A ranked retrieval list for one golden-set question, each result marked <b>relevant</b> or
          not. The <b>cutoff</b> is how far down you keep — everything above the line is{" "}
          <b>retrieved</b>. Slide it, or click a row.
        </p>

        <label className="clab-slider prlab-cutoff">
          <span className="clab-slider-top">
            <span>cutoff k</span>
            <span className="clab-slider-val">
              {k} / {m}
            </span>
          </span>
          <input
            type="range"
            aria-label="cutoff k"
            min={0}
            max={m}
            value={k}
            onChange={(e) => setCutoff(Number(e.target.value))}
          />
        </label>

        <ol className="prlab-list">
          {list.map((it, i) => {
            const isIn = i < k;
            const kind = it.relevant ? (isIn ? "hit" : "miss") : isIn ? "fa" : "cr";
            return (
              <li key={i}>
                <Tooltip
                  content={
                    isIn
                      ? "retrieved — click to move the cutoff here"
                      : "click to retrieve down to here"
                  }
                >
                  <button
                    type="button"
                    className={`prlab-row ${isIn ? "in" : "out"} ${it.relevant ? "rel" : "irr"} ${kind}`}
                    onClick={() => setCutoff(i + 1)}
                  >
                    <span className="prlab-rank">{i + 1}</span>
                    <span className="prlab-mark" aria-hidden="true" />
                    <span className="prlab-text">{it.text}</span>
                    <span className="prlab-tag">
                      {kind === "hit"
                        ? "hit"
                        : kind === "fa"
                          ? "false alarm"
                          : kind === "miss"
                            ? "miss"
                            : ""}
                    </span>
                  </button>
                </Tooltip>
                {isIn && i === k - 1 && (
                  <div className="prlab-cutline">
                    <span>cutoff · retrieved {k}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="prlab-legend">
          <span className="prlab-leg rel">● relevant (in the golden set)</span>
          <span className="prlab-leg irr">○ irrelevant</span>
          <span className="prlab-leg inband">shaded · retrieved</span>
        </div>

        <div className="clab-coach">{coach}</div>

        <p className="clab-foot">
          Retrieval and generation are scored <em>separately</em> (LESSON §3): this is the retrieval
          layer — no model calls, fully deterministic. First relevant doc:{" "}
          {firstRelevant >= 0 ? `rank ${firstRelevant + 1}` : "none"} — the deeper it sits, the more
          “lost in the middle” bites, which is what MRR rewards.
        </p>
      </div>

      {/* ── the scorecard ── */}
      <div className="clab-panel">
        <section className="vlab-card">
          <div className="vlab-card-head">
            <span>Precision @ {k}</span>
            <span className="vlab-big">{precision == null ? "—" : pct(precision)}</span>
          </div>
          <div className="prlab-meter">
            <div className="prlab-meter-fill" style={{ width: pct(precision ?? 0) }} />
          </div>
          <p className="prlab-formula">
            hits / retrieved = {hits} / {k} — of what you pulled, how much is signal
          </p>
        </section>

        <section className="vlab-card">
          <div className="vlab-card-head">
            <span>Recall @ {k}</span>
            <span className="vlab-big">{recall == null ? "—" : pct(recall)}</span>
          </div>
          <div className="prlab-meter">
            <div className="prlab-meter-fill" style={{ width: pct(recall ?? 0) }} />
          </div>
          <p className="prlab-formula">
            hits / relevant = {hits} / {relevantTotal} — of the answers, how many you found
          </p>
        </section>

        <section className="vlab-card prlab-counts">
          <div className="prlab-count hit">
            <span className="prlab-count-n">{hits}</span>
            <span className="prlab-count-k">hits</span>
          </div>
          <div className="prlab-count miss">
            <span className="prlab-count-n">{misses}</span>
            <span className="prlab-count-k">misses</span>
          </div>
          <div className="prlab-count fa">
            <span className="prlab-count-n">{falseAlarms}</span>
            <span className="prlab-count-k">false alarms</span>
          </div>
        </section>

        <div className="vlab-model">
          <b>Precision</b> asks: is what I retrieved clean? <b>Recall</b> asks: did I get
          everything? Sliding the cutoff right can only <b>raise recall</b> — and usually{" "}
          <b>costs precision</b>, because you scoop up irrelevant docs to reach the deep relevant
          ones.
        </div>

        <section className="vlab-presets">
          <div className="vlab-presets-label">Try a shape</div>
          <div className="vlab-presets-row">
            {presets.map((p, i) => (
              <button key={i} className="vlab-preset" onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
