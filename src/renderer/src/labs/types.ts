// Lab config types, ported from the learning-harness engine
// (study/src/api.ts + the LabProps shape from study/src/lab/registry.ts).
// Doc comments and shapes are kept verbatim so a course's lab.json reads the same here.

/** Optional per-module math-lab config (curriculum/NN/lab.json). See LAB.md. */
export interface VectorLabConfig {
  axisX?: string;
  axisY?: string;
  a?: { role?: string; text?: string; v?: [number, number] };
  b?: { role?: string; text?: string; v?: [number, number] };
  presets?: {
    label: string;
    a: [number, number];
    b: [number, number];
    aText?: string;
    bText?: string;
  }[];
}
/** Config for the Chunking & Overlap lab — words stand in for tokens. */
export interface ChunkingLabConfig {
  /** The document to chunk (whitespace-split; each word is a token stand-in). */
  text?: string;
  /** Initial chunk size, in tokens. */
  size?: number;
  /** Initial overlap, in tokens. */
  overlap?: number;
  /** Half-open token range [start, end) of a "fact" to track across boundaries. */
  factSpan?: [number, number];
  /** Human label for the tracked fact, e.g. "runs on port 5173". */
  factLabel?: string;
  presets?: { label: string; size: number; overlap: number }[];
}
/** Config for the Top-k Retrieval lab — a 2-D corpus, a query, and the k knob. */
export interface TopkLabConfig {
  axisX?: string;
  axisY?: string;
  /** The draggable query point (a direction in the same 2-D space as the corpus). */
  query?: { text?: string; v?: [number, number] };
  /** The corpus: short chunk texts at 2-D positions (plane range ±3, like the vectors lab). */
  corpus?: { text: string; v: [number, number] }[];
  /** Initial k — how many chunks retrieval returns unconditionally. */
  k?: number;
  /** Similarity-threshold floor (LESSON 03 §7): a top score below it means "refuse". */
  floor?: number;
  presets?: { label: string; query: [number, number]; k: number }[];
}
/** One ranked retrieval result in the Precision & Recall lab's golden-set list. */
export interface RankedItem {
  /** Short label for the retrieved chunk (e.g. a source path + snippet). */
  text: string;
  /** Whether this chunk is actually relevant to the question (the golden-set truth). */
  relevant: boolean;
}
/** Config for the Precision & Recall lab — a ranked list and a cutoff. */
export interface PrecisionRecallLabConfig {
  /** The ranked retrieval list, best-first; array order is the rank. */
  items?: RankedItem[];
  /** Initial cutoff k (how far down the ranking counts as "retrieved"). */
  cutoff?: number;
  /** Characteristic shapes to load; each may carry its own ranking and cutoff. */
  presets?: { label: string; items?: RankedItem[]; cutoff?: number }[];
}
/** A course-owned visualization: a self-contained HTML file under the module's visuals/. */
export interface VisualDef {
  /** Filename inside the module's visuals/ dir (a leading "visuals/" is tolerated). */
  file: string;
  title: string;
  /** One line: what you'll feel by playing with it. */
  blurb?: string;
}
export interface ModuleLabConfig {
  /** What the learner is currently wrestling with — shown as a callout in the lab. */
  focus?: string;
  /**
   * Id of the lab entry the `focus` text is written for. When a module claims
   * several visuals, this picks which one shows the callout and which one the
   * overlay opens to. Absent → the module's first visual.
   */
  focusLab?: string;
  /**
   * Claiming a stock lab = carrying its config key. The engine ships the
   * components; the course decides (via lab.json) which modules they serve.
   */
  vectors?: VectorLabConfig;
  chunking?: ChunkingLabConfig;
  topk?: TopkLabConfig;
  "precision-recall"?: PrecisionRecallLabConfig;
  /** Course-generated visuals (self-contained HTML, rendered in sandboxed iframes). */
  visuals?: VisualDef[];
}

/** Props every stock lab component receives from the overlay. */
export interface LabProps {
  config?: ModuleLabConfig | null;
  moduleId?: string | null;
}
