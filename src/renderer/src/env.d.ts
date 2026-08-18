import type { PraxeumApi } from "../../shared/ipc";

declare global {
  interface Window {
    readonly praxeum: PraxeumApi;
  }
}

export {};
