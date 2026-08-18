import { useCallback, useEffect, useState } from "react";
import type { PraxeumApi } from "../../../shared/ipc";
import type { ProviderCatalog, ProviderReadiness, TutorProviderId } from "../../../shared/provider";

const EMPTY_CATALOG: ProviderCatalog = { selectedProviderId: null, providers: [] };

/** Explicit so this module also typechecks in the Node test project, which
 * intentionally does not load the renderer's global env declaration. */
function bridge(): PraxeumApi {
  return (window as unknown as { praxeum: PraxeumApi }).praxeum;
}

export function selectedReadiness(catalog: ProviderCatalog): ProviderReadiness | null {
  if (catalog.selectedProviderId === null) return null;
  return catalog.providers.find((provider) => provider.id === catalog.selectedProviderId) ?? null;
}

export interface TutorConnectionController {
  catalog: ProviderCatalog;
  checking: boolean;
  selected: ProviderReadiness | null;
  ready: boolean;
  loggingIn: TutorProviderId | null;
  cancelling: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  select: (providerId: TutorProviderId) => Promise<void>;
  login: (providerId: TutorProviderId) => Promise<void>;
  openGuide: (providerId: TutorProviderId) => Promise<void>;
  recheck: (providerId: TutorProviderId) => Promise<void>;
  cancelLogin: () => Promise<void>;
}

export function useTutorConnection(): TutorConnectionController {
  const [catalog, setCatalog] = useState<ProviderCatalog>(EMPTY_CATALOG);
  const [checking, setChecking] = useState(true);
  const [loggingIn, setLoggingIn] = useState<TutorProviderId | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setChecking(true);
    try {
      setCatalog(await bridge().listTutorProviders());
      setError(null);
    } catch {
      setError("Your tutor connection could not be checked. Try again.");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void bridge()
      .listTutorProviders()
      .then((next) => {
        if (active) setCatalog(next);
      })
      .catch(() => {
        if (active) setError("Your tutor connection could not be checked. Try again.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const select = useCallback(async (providerId: TutorProviderId): Promise<void> => {
    setError(null);
    try {
      setCatalog(await bridge().selectTutorProvider(providerId));
    } catch {
      setError("That tutor could not be selected. Try again.");
    }
  }, []);

  const login = useCallback(async (providerId: TutorProviderId): Promise<void> => {
    setError(null);
    setCancelling(false);
    try {
      const selected = await bridge().selectTutorProvider(providerId);
      setCatalog(selected);
      setLoggingIn(providerId);
      const reply = await bridge().loginTutorProvider(providerId);
      const latest = await bridge().listTutorProviders();
      setCatalog(latest);
      if (!reply.ok && reply.reason !== "cancelled") setError(reply.detail);
    } catch {
      setError("Sign-in did not finish. You can try again.");
    } finally {
      setLoggingIn(null);
      setCancelling(false);
    }
  }, []);

  const openGuide = useCallback(async (providerId: TutorProviderId): Promise<void> => {
    setError(null);
    try {
      setCatalog(await bridge().selectTutorProvider(providerId));
      await bridge().openTutorProviderSetupGuide(providerId);
    } catch {
      setError("The official setup guide could not be opened. Try again.");
    }
  }, []);

  const recheck = useCallback(async (providerId: TutorProviderId): Promise<void> => {
    setChecking(true);
    setError(null);
    try {
      await bridge().selectTutorProvider(providerId);
      setCatalog(await bridge().listTutorProviders());
    } catch {
      setError("Your tutor connection could not be checked. Try again.");
    } finally {
      setChecking(false);
    }
  }, []);

  const cancelLogin = useCallback(async (): Promise<void> => {
    if (loggingIn === null || cancelling) return;
    setCancelling(true);
    try {
      await bridge().cancelTutorProviderLogin(loggingIn);
    } catch {
      setError("Sign-in could not be cancelled. Close the provider window and try again.");
      setCancelling(false);
    }
  }, [cancelling, loggingIn]);

  const selected = selectedReadiness(catalog);
  return {
    catalog,
    checking,
    selected,
    ready: selected?.connection === "connected",
    loggingIn,
    cancelling,
    error,
    refresh,
    select,
    login,
    openGuide,
    recheck,
    cancelLogin,
  };
}
