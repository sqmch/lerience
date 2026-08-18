import { useCallback, useEffect, useState } from "react";
import type { ThemePreference, ThemeState } from "../../../shared/ipc";

const CYCLE: readonly ThemePreference[] = ["system", "light", "dark"];

/** The OS-drawn caption buttons cannot read CSS, so the resolved token values
 *  are handed to them after every theme change (ADR-016). Reading from computed
 *  style rather than a constant is what keeps colour inside the design layer:
 *  re-cut the palette and the window frame follows with no code change. */
function pushTitleBarOverlay(): void {
  if (typeof window.praxeum === "undefined") return;
  const styles = getComputedStyle(document.documentElement);
  const color = styles.getPropertyValue("--chrome").trim();
  const symbolColor = styles.getPropertyValue("--ink-dim").trim();
  if (color === "" || symbolColor === "") return;
  void window.praxeum.setTitleBarOverlay({ color, symbolColor });
}

export interface Theme {
  preference: ThemePreference;
  dark: boolean;
  /** system → light → dark → system. */
  cycle: () => void;
}

export function useTheme(): Theme {
  const [state, setState] = useState<ThemeState>({ preference: "system", dark: true });

  const adopt = useCallback((next: ThemeState) => {
    setState(next);
    /* After paint: the media query has to have re-resolved before the computed
       tokens report the new theme's values. */
    requestAnimationFrame(pushTitleBarOverlay);
  }, []);

  useEffect(() => {
    /* The frame must still render if the bridge is missing (a failed preload in
       dev): the app is then unthemeable, not blank. */
    if (typeof window.praxeum === "undefined") return;
    void window.praxeum.getTheme().then(adopt);
    return window.praxeum.onThemeChanged(adopt);
  }, [adopt]);

  const cycle = useCallback(() => {
    if (typeof window.praxeum === "undefined") return;
    const next = CYCLE[(CYCLE.indexOf(state.preference) + 1) % CYCLE.length] ?? "system";
    void window.praxeum.setTheme(next).then(adopt);
  }, [adopt, state.preference]);

  return { preference: state.preference, dark: state.dark, cycle };
}
