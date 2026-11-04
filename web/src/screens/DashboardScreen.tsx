import { useState } from "react";
import { PageHeader, useToast } from "@freeappstore/sdk/ui";
import type { AppData } from "../types";
import type { SaveResult } from "../db";
import { downloadBackup, parseBackup, restoreBackup } from "../db";
import { computeVehicleStats, fmt, fmtCurrency } from "../stats";
import { buildSampleData } from "../sampleData";
import { StatCard } from "../components/StatCard";
import { Modal } from "../components/Modal";

interface Props {
  data: AppData;
  selectedVehicleId: string | null;
  onSave: (data: AppData) => Promise<SaveResult>;
  onNavigateVehicles: () => void;
  onNavigateLog: () => void;
}

type ImportStep = "idle" | "preview";

interface ImportState {
  step: ImportStep;
  parseError: string | null;
  preview: Awaited<ReturnType<typeof parseBackup>> | null;
  mergeMode: "replace" | "merge" | "";
}

export function DashboardScreen({ data, selectedVehicleId, onSave, onNavigateVehicles, onNavigateLog }: Props) {
  const toast = useToast();
  const [showBackup, setShowBackup] = useState(false);
  const [showSampleConfirm, setShowSampleConfirm] = useState(false);
  const [importState, setImportState] = useState<ImportState>({
    step: "idle", parseError: null, preview: null, mergeMode: "",
  });
  const [importing, setImporting] = useState(false);

  const vehicle = data.vehicles.find(v => v.id === selectedVehicleId);
  const stats = vehicle ? computeVehicleStats(vehicle.id, data) : null;

  // ── Sample data ────────────────────────────────────────────────────────────

  const handleLoadSample = async () => {
    const sample = buildSampleData();
    const existingIds = new Set(data.vehicles.map(v => v.id));
    if (existingIds.has("sample-v1")) {
      toast.show("Sample data is already loaded", { variant: "success" });
      setShowSampleConfirm(false);
      return;
    }
    const newData: AppData = {
      ...data,
      vehicles: [...data.vehicles, ...sample.vehicles],
      fuelEntries: [...data.fuelEntries, ...sample.fuelEntries],
      expenseEntries: [...data.expenseEntries, ...sample.expenseEntries],
    };
    const result = await onSave(newData);
    if (result.ok) {
      toast.show("Sample data loaded — select 'Sample Hatchback' in Vehicles", { variant: "success" });
    } else {
      toast.show(`Failed to load sample data: ${result.reason}`, { variant: "error" });
    }
    setShowSampleConfirm(false);
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    try { await downloadBackup(data); toast.show("Backup exported", { variant: "success" }); }
    catch (error) { toast.show(error instanceof Error ? error.message : "Export failed", {variant: "error"}); }
  };

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setImportState({step: "preview", parseError: "Backup exceeds the 2 MB limit.", preview: null, mergeMode: ""});
      e.target.value = ""; return;
    }
    const reader = new FileReader();
    reader.onload = async ev => {
      const raw = ev.target?.result as string;
      const parsed = await parseBackup(raw);
      setImportState(s => ({
        ...s,
        parseError: parsed.ok ? null : parsed.reason,
        preview: parsed,
        step: "preview",
      }));
    };
    reader.onerror = () => setImportState({step: "preview", parseError: "Could not read this file.", preview: null, mergeMode: ""});
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImportConfirm = async () => {
    if (!importState.preview || !importState.preview.ok) return;
    setImporting(true);
    const mode = importState.mergeMode;
    if (!mode) { setImporting(false); return; }
    const result = await restoreBackup(importState.preview, mode, onSave);
    setImporting(false);
    if (result.ok) {
      toast.show(
        importState.mergeMode === "replace"
          ? "Data replaced from backup"
          : "Backup merged into existing data",
        { variant: "success" }
      );
      setImportState({ step: "idle", parseError: null, preview: null, mergeMode: "" });
      setShowBackup(false);
    } else {
      toast.show(`Import failed: ${result.reason}`, { variant: "error" });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalVehicles = data.vehicles.length;
  const totalFuel = data.fuelEntries.reduce((s, e) => s + e.totalCost, 0);
  const totalExpenses = data.expenseEntries.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHeader title="Dashboard" />

      {/* Overall summary */}
      <section aria-label="Overall summary" className="mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-3">All Vehicles</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Vehicles"
            value={String(totalVehicles)}
            icon={<span aria-hidden="true">🚗</span>}
          />
          <StatCard
            label="Total Fuel"
            value={fmtCurrency(totalFuel)}
            icon={<span aria-hidden="true">⛽</span>}
          />
          <StatCard
            label="Total Expenses"
            value={fmtCurrency(totalExpenses)}
            icon={<span aria-hidden="true">🧾</span>}
            accent
          />
        </div>
      </section>

      {/* Active vehicle stats */}
      {vehicle && stats ? (
        <section aria-label={`Stats for ${vehicle.name}`} className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-3">
            {vehicle.name}
            {(vehicle.make || vehicle.model || vehicle.year) && (
              <span className="normal-case font-normal ml-1">
                — {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ")}
              </span>
            )}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <StatCard
              label="Fuel Cost"
              value={fmtCurrency(stats.totalFuelCost)}
              sub={`${stats.totalFuelEntries} fill-up${stats.totalFuelEntries !== 1 ? "s" : ""}`}
              icon={<span aria-hidden="true">⛽</span>}
            />
            <StatCard
              label="Other Expenses"
              value={fmtCurrency(stats.totalExpenseCost)}
              sub={`${stats.totalExpenseEntries} entr${stats.totalExpenseEntries !== 1 ? "ies" : "y"}`}
              icon={<span aria-hidden="true">🧾</span>}
            />
            <StatCard
              label="Total Spend"
              value={fmtCurrency(stats.totalCost)}
              icon={<span aria-hidden="true">💰</span>}
              accent
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              label="Total Litres"
              value={`${fmt(stats.totalLitres, 1)} L`}
              icon={<span aria-hidden="true">🔋</span>}
            />
            {stats.lastOdometer !== null && (
              <StatCard
                label="Last Odometer"
                value={`${stats.lastOdometer.toLocaleString()} km`}
                icon={<span aria-hidden="true">📍</span>}
              />
            )}
            {/* L/100km — only shown when valid consecutive full-tank data exists */}
            {stats.avgL100km !== null ? (
              <StatCard
                label="Avg L/100km"
                value={fmt(stats.avgL100km)}
                sub={`from ${stats.consumption.length} interval${stats.consumption.length !== 1 ? "s" : ""}`}
                icon={<span aria-hidden="true">📊</span>}
              />
            ) : (
              <div className="rounded-[1.25rem] bg-[var(--panel)] p-4 flex flex-col gap-1">
                <div className="text-xl text-[var(--muted)]" aria-hidden="true">📊</div>
                <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">L/100km</div>
                <div className="text-xs text-[var(--muted)] leading-snug mt-0.5">
                  Log 2+ consecutive full-tank fill-ups to calculate consumption.
                </div>
              </div>
            )}
          </div>

          {/* Consumption intervals table */}
          {stats.consumption.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">
                Consumption Intervals
              </h3>
              <div className="rounded-[1.25rem] bg-[var(--panel)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[320px]" aria-label="Fuel consumption intervals">
                    <thead>
                      <tr className="border-b border-[var(--line)]">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--muted)]">Date</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--muted)]">Distance</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--muted)]">Litres</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--muted)]">L/100km</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.consumption.map((c, i) => (
                        <tr key={i} className="border-b border-[var(--line)] last:border-0">
                          <td className="px-4 py-2.5 text-[var(--ink)]">{c.date}</td>
                          <td className="px-4 py-2.5 text-right text-[var(--ink)]">{c.distanceKm.toLocaleString()} km</td>
                          <td className="px-4 py-2.5 text-right text-[var(--ink)]">{fmt(c.litres, 1)} L</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[var(--ink-strong,var(--ink))]">{fmt(c.l100km)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : totalVehicles === 0 ? (
        <div className="rounded-[1.25rem] bg-[var(--panel)] p-8 text-center mb-6">
          <div className="text-4xl mb-3" aria-hidden="true">🚗</div>
          <p className="font-semibold text-[var(--ink)]">No vehicles yet</p>
          <p className="text-sm text-[var(--muted)] mt-1 mb-4">Add your first vehicle to start tracking fuel and expenses.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onNavigateVehicles}
              className="bg-[var(--accent)] text-white px-5 py-2.5 rounded-[0.75rem] text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors"
            >
              Add Vehicle
            </button>
            <button
              onClick={() => setShowSampleConfirm(true)}
              className="border border-[var(--line)] text-[var(--ink)] px-5 py-2.5 rounded-[0.75rem] text-sm font-medium min-h-[44px] hover:bg-[var(--panel)] transition-colors"
            >
              Try sample data
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-[1.25rem] bg-[var(--panel)] p-6 text-center mb-6">
          <p className="text-sm text-[var(--muted)]">No active vehicle — select one in Vehicles.</p>
          <button onClick={onNavigateVehicles}
            className="mt-3 text-sm text-[var(--accent)] underline underline-offset-2 min-h-[44px]">
            Go to Vehicles
          </button>
        </div>
      )}

      {/* Quick actions */}
      <section aria-label="Actions" className="mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-3">Actions</h2>
        <div className="flex flex-col gap-2">
          {vehicle && (
            <button
              onClick={onNavigateLog}
              className="flex items-center gap-3 w-full text-left rounded-[1.25rem] bg-[var(--panel)] px-5 py-4 hover:bg-[var(--accent-soft,var(--panel))] transition-colors min-h-[56px]"
            >
              <span className="text-xl" aria-hidden="true">⛽</span>
              <span className="text-sm font-medium text-[var(--ink)]">Log fuel fill-up for {vehicle.name}</span>
              <svg className="ml-auto text-[var(--muted)] flex-shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowBackup(true)}
            className="flex items-center gap-3 w-full text-left rounded-[1.25rem] bg-[var(--panel)] px-5 py-4 hover:bg-[var(--accent-soft,var(--panel))] transition-colors min-h-[56px]"
          >
            <span className="text-xl" aria-hidden="true">💾</span>
            <span className="text-sm font-medium text-[var(--ink)]">Backup & restore</span>
            <svg className="ml-auto text-[var(--muted)] flex-shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            onClick={() => setShowSampleConfirm(true)}
            className="flex items-center gap-3 w-full text-left rounded-[1.25rem] bg-[var(--panel)] px-5 py-4 hover:bg-[var(--accent-soft,var(--panel))] transition-colors min-h-[56px]"
          >
            <span className="text-xl" aria-hidden="true">🧪</span>
            <span className="text-sm font-medium text-[var(--ink)]">Load sample data</span>
            <svg className="ml-auto text-[var(--muted)] flex-shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </section>

      {/* ── Sample data confirm modal ── */}
      {showSampleConfirm && (
        <Modal title="Load Sample Data?" onClose={() => setShowSampleConfirm(false)}>
          <p className="text-sm text-[var(--ink)] mb-2">
            This will add a sample vehicle ("Sample Hatchback — Toyota Corolla") with realistic fuel and expense entries so you can explore the app.
          </p>
          <p className="text-sm text-[var(--muted)] mb-4">
            Your existing data will not be modified. You can delete the sample vehicle at any time from Vehicles.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowSampleConfirm(false)}
              className="flex-1 py-2.5 rounded-[0.75rem] border border-[var(--line)] text-sm font-medium min-h-[44px] hover:bg-[var(--panel)] transition-colors">
              Cancel
            </button>
            <button onClick={handleLoadSample}
              className="flex-1 py-2.5 rounded-[0.75rem] bg-[var(--accent)] text-white text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors">
              Load Sample Data
            </button>
          </div>
        </Modal>
      )}

      {/* ── Backup & restore modal ── */}
      {showBackup && (
        <Modal title="Backup & Restore" onClose={() => {
          setShowBackup(false);
          setImportState({ step: "idle", parseError: null, preview: null, mergeMode: "" });
        }} wide>
          <div className="flex flex-col gap-6">
            {/* Export section */}
            <div>
              <h3 className="font-semibold text-sm text-[var(--ink)] mb-1">Export backup</h3>
              <p className="text-xs text-[var(--muted)] mb-3">
                Downloads all your data as a JSON file you can keep as a backup or import on another device.
                {" "}<strong>{data.vehicles.length}</strong> vehicle{data.vehicles.length !== 1 ? "s" : ""},
                {" "}<strong>{data.fuelEntries.length}</strong> fuel {data.fuelEntries.length !== 1 ? "entries" : "entry"},
                {" "}<strong>{data.expenseEntries.length}</strong> {data.expenseEntries.length !== 1 ? "expenses" : "expense"}.
              </p>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 bg-[var(--accent)] text-white px-4 py-2.5 rounded-[0.75rem] text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 2v8M5 7l3 3 3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Export JSON
              </button>
            </div>

            <hr className="border-[var(--line)]" />

            {/* Import section */}
            <div>
              <h3 className="font-semibold text-sm text-[var(--ink)] mb-1">Import backup</h3>
              <p className="text-xs text-[var(--muted)] mb-3">
                Select a Pitstop Log JSON backup file. You'll preview the contents and choose how to import before anything is written.
              </p>

              {importState.step === "idle" && (
                <label className="inline-flex cursor-pointer">
                  <span className="flex items-center gap-2 bg-[var(--panel)] border border-[var(--line)] text-[var(--ink)] px-4 py-2.5 rounded-[0.75rem] text-sm font-medium min-h-[44px] hover:bg-[var(--paper)] transition-colors">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M8 10V2M5 5l3-3 3 3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Choose file…
                  </span>
                  <input type="file" accept=".json,application/json" className="sr-only" onChange={handleFileSelect} />
                </label>
              )}

              {importState.step === "preview" && (
                <div className="flex flex-col gap-4">
                  {importState.parseError ? (
                    <>
                      <div className="rounded-[0.75rem] bg-[var(--danger-soft,#fee2e2)] border border-[var(--danger)] p-3">
                        <p className="text-sm font-semibold text-[var(--danger)]">Could not read backup</p>
                        <p className="text-xs text-[var(--danger)] mt-1">{importState.parseError}</p>
                      </div>
                      <button
                        onClick={() => setImportState(s => ({ ...s, step: "idle", parseError: null, preview: null }))}
                        className="py-2.5 rounded-[0.75rem] border border-[var(--line)] text-sm font-medium min-h-[44px] hover:bg-[var(--panel)] transition-colors"
                      >
                        Try another file
                      </button>
                    </>
                  ) : importState.preview?.ok && (
                    <>
                      {/* Preview card */}
                      <div className="rounded-[0.75rem] bg-[var(--panel)] p-4 text-sm">
                        <p className="font-semibold text-[var(--ink)] mb-1">Backup preview</p>
                        <p className="text-[var(--muted)] text-xs mb-2">
                          Exported: {importState.preview.payload.exportedAt
                            ? new Date(importState.preview.payload.exportedAt).toLocaleString()
                            : "unknown date"}
                        </p>
                        <ul className="text-xs text-[var(--ink)] space-y-1">
                          <li>🚗 {importState.preview.payload.data.vehicles.length} vehicle{importState.preview.payload.data.vehicles.length !== 1 ? "s" : ""}</li>
                          <li>⛽ {importState.preview.payload.data.fuelEntries.length} fuel {importState.preview.payload.data.fuelEntries.length !== 1 ? "entries" : "entry"}</li>
                          <li>🧾 {importState.preview.payload.data.expenseEntries.length} {importState.preview.payload.data.expenseEntries.length !== 1 ? "expenses" : "expense"}</li>
                        </ul>
                      </div>

                      {/* Merge mode */}
                      <fieldset>
                        <legend className="text-sm font-semibold text-[var(--ink)] mb-2">How should we import?</legend>
                        <div className="flex flex-col gap-3">
                          {(["replace", "merge"] as const).map(mode => (
                            <label key={mode} className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                              <input
                                type="radio"
                                name="mergeMode"
                                value={mode}
                                checked={importState.mergeMode === mode}
                                onChange={() => setImportState(s => ({ ...s, mergeMode: mode }))}
                                className="mt-0.5 accent-[var(--accent)]"
                              />
                              <span>
                                <span className="text-sm font-semibold text-[var(--ink)] capitalize">{mode}</span>
                                <span className="block text-xs text-[var(--muted)] mt-0.5">
                                  {mode === "replace"
                                    ? "Overwrite all current data with the backup contents. This cannot be undone."
                                    : "Add records from the backup that are not already in your data (matched by ID). Existing records are kept."}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>

                      {importState.mergeMode === "replace" && (
                        <div className="rounded-[0.75rem] bg-[var(--warning-soft,#fef3c7)] border border-[var(--warning,#92400e)] p-3">
                          <p className="text-xs font-semibold text-[var(--warning,#92400e)]">
                            ⚠️ Replace will permanently overwrite your current {data.vehicles.length} vehicle{data.vehicles.length !== 1 ? "s" : ""} and all entries. Export a backup first if you want to keep your current data.
                          </p>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button
                          onClick={() => setImportState(s => ({ ...s, step: "idle", parseError: null, preview: null }))}
                          className="flex-1 py-2.5 rounded-[0.75rem] border border-[var(--line)] text-sm font-medium min-h-[44px] hover:bg-[var(--panel)] transition-colors"
                        >
                          Choose different file
                        </button>
                        <button
                          onClick={handleImportConfirm}
                          disabled={importing || !importState.mergeMode}
                          className="flex-1 py-2.5 rounded-[0.75rem] bg-[var(--accent)] text-white text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors disabled:opacity-60"
                        >
                          {importing ? "Importing…" : !importState.mergeMode ? "Choose import mode" : importState.mergeMode === "replace" ? "Replace all data" : "Merge data"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
