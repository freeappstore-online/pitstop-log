import { useEffect, useState, useCallback } from "react";
import { initApp } from "@freeappstore/sdk";
import { type NavItem, Shell } from "@freeappstore/sdk/ui";
import { loadData, saveData, loadSelectedVehicleId, saveSelectedVehicleId } from "./db";
import type { AppData } from "./types";
import type { SaveResult } from "./db";
import { DashboardScreen } from "./screens/DashboardScreen";
import { LogScreen } from "./screens/LogScreen";
import { VehiclesScreen } from "./screens/VehiclesScreen";

// "pitstop-log" is replaced by the deployment flow with this app's real id.
export const fas = initApp({ appId: "pitstop-log" });

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/",         title: "Pitstop Log" },
  { label: "Log",       href: "/log",       title: "Log — Pitstop Log" },
  { label: "Vehicles",  href: "/vehicles",  title: "Vehicles — Pitstop Log" },
];

type LoadState = "loading" | "ready" | "error";

function AppInner() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [data, setData] = useState<AppData>({
    vehicles: [], fuelEntries: [], expenseEntries: [], schemaVersion: 1,
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // ── Load data on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [appData, savedVehicleId] = await Promise.all([
          loadData(),
          loadSelectedVehicleId(),
        ]);
        if (cancelled) return;
        setData(appData);
        const validId = savedVehicleId && appData.vehicles.some(v => v.id === savedVehicleId)
          ? savedVehicleId
          : appData.vehicles[0]?.id ?? null;
        setSelectedVehicleId(validId);
        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("[pitstop] Failed to load data:", err);
        setLoadState("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Save helper ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (newData: AppData): Promise<SaveResult> => {
    const result = await saveData(newData);
    if (result.ok) {
      setData(newData);
    }
    return result;
  }, []);

  // ── Vehicle selection ────────────────────────────────────────────────────────
  const handleSelectVehicle = useCallback((id: string) => {
    setSelectedVehicleId(id || null);
    saveSelectedVehicleId(id || null);
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const navigate = useCallback((href: string) => {
    window.history.pushState(null, "", href);
    setPath(window.location.pathname);
  }, []);

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  // ── PWA dirty guard ──────────────────────────────────────────────────────────
  // Expose dirty flag to the pwa busy guard registered in fas-capabilities/pwa.ts
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__pitstopDirty = dirty;
  }, [dirty]);

  // ── Retry after load error ───────────────────────────────────────────────────
  const handleRetry = () => {
    setLoadState("loading");
    loadData()
      .then(appData => {
        setData(appData);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  };

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <Shell app={fas} appName="Pitstop Log" nav={NAV} onNavigate={navigate}>
        <div className="flex items-center justify-center min-h-[40vh]" role="status" aria-live="polite">
          <div className="text-center">
            <div
              className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-3"
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--muted)]">Loading your data…</p>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (loadState === "error") {
    return (
      <Shell app={fas} appName="Pitstop Log" nav={NAV} onNavigate={navigate}>
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-center max-w-sm mx-auto p-6">
            <div className="text-4xl mb-3" aria-hidden="true">⚠️</div>
            <p className="font-semibold text-[var(--ink)] mb-1">Couldn't load your data</p>
            <p className="text-sm text-[var(--muted)] mb-4">
              There was a problem reading from device storage. Your data may still be intact — try again or check browser storage permissions.
            </p>
            <button
              onClick={handleRetry}
              className="bg-[var(--accent)] text-white px-5 py-2.5 rounded-[0.75rem] text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Resolve current screen ────────────────────────────────────────────────
  const normalised = path.replace(/\/$/, "") || "/";
  const screen =
    normalised === "/log" ? "log" :
    normalised === "/vehicles" ? "vehicles" :
    "dashboard";

  return (
    <Shell app={fas} appName="Pitstop Log" nav={NAV} onNavigate={navigate}>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        {screen === "dashboard" && (
          <DashboardScreen
            data={data}
            selectedVehicleId={selectedVehicleId}
            onSave={handleSave}
            onNavigateVehicles={() => navigate("/vehicles")}
            onNavigateLog={() => navigate("/log")}
          />
        )}
        {screen === "log" && (
          <LogScreen
            data={data}
            selectedVehicleId={selectedVehicleId}
            onSave={handleSave}
            dirty={dirty}
            setDirty={setDirty}
            onNavigateVehicles={() => navigate("/vehicles")}
          />
        )}
        {screen === "vehicles" && (
          <VehiclesScreen
            data={data}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={handleSelectVehicle}
            onSave={handleSave}
            dirty={dirty}
            setDirty={setDirty}
          />
        )}
      </div>
    </Shell>
  );
}

export default function App() {
  return <AppInner />;
}
