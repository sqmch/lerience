// App-owned implementations of the internal Course Engine's stock-lab ids.
// Display metadata lives once in course-engine/template/docs/stock-labs.json.
//
// NOTE: lab.css is deliberately NOT imported here — the app imports it
// separately, alongside its other stylesheets.

import type { ComponentType } from "react";
import type { LabProps } from "./types";
import { VectorSimilarityLab } from "./VectorSimilarityLab";
import { ChunkingOverlapLab } from "./ChunkingOverlapLab";
import { TopKRetrievalLab } from "./TopKRetrievalLab";
import { PrecisionRecallLab } from "./PrecisionRecallLab";

export const STOCK_LAB_COMPONENTS: Record<string, ComponentType<LabProps>> = {
  vectors: VectorSimilarityLab,
  chunking: ChunkingOverlapLab,
  topk: TopKRetrievalLab,
  "precision-recall": PrecisionRecallLab,
};

export type {
  LabProps,
  ModuleLabConfig,
  VectorLabConfig,
  ChunkingLabConfig,
  TopkLabConfig,
  PrecisionRecallLabConfig,
  RankedItem,
  VisualDef,
} from "./types";
