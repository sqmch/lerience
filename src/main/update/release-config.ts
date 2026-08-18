import type { UpdateReleaseConfig } from "./service";

declare const __PRAXEUM_RELEASE_CONFIG__: UpdateReleaseConfig | null;

/** Replaced by electron-vite at build time. Unit tests and source execution
 * deliberately see no release channel unless they inject one. */
export const compiledReleaseConfig: UpdateReleaseConfig | null =
  typeof __PRAXEUM_RELEASE_CONFIG__ === "undefined" ? null : __PRAXEUM_RELEASE_CONFIG__;
