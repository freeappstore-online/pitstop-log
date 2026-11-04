/**
 * Device-local persistence via @freeappstore/sdk/persist (IndexedDB).
 * All reads/writes go through validated helpers; errors are surfaced to callers.
 */
import { openStore, putRecord, getPreference, setPreference } from "@freeappstore/sdk/persist";
import type { AppData, Vehicle, FuelEntry, ExpenseEntry } from "./types";
import { SCHEMA_VERSION } from "./types";

const STORE_NAME = "pitstop";
const RECORD_KEY = "appdata";

// ─── Validation ───────────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v);
}
function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function validateVehicle(v: unknown): v is Vehicle {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isString(o.id) && o.id.length > 0 &&
    isString(o.name) &&
    isString(o.make) &&
    isString(o.model) &&
    (o.year === null || isNumber(o.year)) &&
    isString(o.colour) &&
    isString(o.createdAt)
  );
}

function validateFuelEntry(e: unknown): e is FuelEntry {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  return (
    isString(o.id) && o.id.length > 0 &&
    isString(o.vehicleId) && o.vehicleId.length > 0 &&
    isString(o.date) &&
    isNumber(o.odometer) && (o.odometer as number) >= 0 &&
    isNumber(o.litres) && (o.litres as number) > 0 &&
    isNumber(o.totalCost) && (o.totalCost as number) > 0 &&
    isBoolean(o.fullTank) &&
    isString(o.notes)
  );
}

function validateExpenseEntry(e: unknown): e is ExpenseEntry {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  return (
    isString(o.id) && o.id.length > 0 &&
    isString(o.vehicleId) && o.vehicleId.length > 0 &&
    isString(o.date) &&
    isString(o.category) &&
    isNumber(o.amount) && (o.amount as number) > 0 &&
    isString(o.description)
  );
}

function validateAppData(raw: unknown): AppData {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid data: not an object");
  }
  const o = raw as Record<string, unknown>;

  if (!Array.isArray(o.vehicles)) throw new Error("Invalid data: vehicles missing");
  if (!Array.isArray(o.fuelEntries)) throw new Error("Invalid data: fuelEntries missing");
  if (!Array.isArray(o.expenseEntries)) throw new Error("Invalid data: expenseEntries missing");

  const vehicles = o.vehicles.filter(validateVehicle);
  const fuelEntries = o.fuelEntries.filter(validateFuelEntry);
  const expenseEntries = o.expenseEntries.filter(validateExpenseEntry);

  const dropped =
    (o.vehicles.length - vehicles.length) +
    (o.fuelEntries.length - fuelEntries.length) +
    (o.expenseEntries.length - expenseEntries.length);

  if (dropped > 0) {
    console.warn(`[pitstop] Dropped ${dropped} invalid record(s) during validation`);
  }

  return {
    vehicles,
    fuelEntries,
    expenseEntries,
    schemaVersion: SCHEMA_VERSION,
  };
}

// ─── Store helpers ────────────────────────────────────────────────────────────

export type SaveResult = { ok: true } | { ok: false; reason: string };

let _store: Awaited<ReturnType<typeof openStore>> | null = null;

async function getStore() {
  if (!_store) {
    const result = await openStore(STORE_NAME);
    if (!result.ok) throw new Error(result.reason ?? "Failed to open IndexedDB store");
    _store = result;
  }
  return _store;
}

export async function loadData(): Promise<AppData> {
  try {
    const store = await getStore();
    const rec = await store.get(RECORD_KEY);
    if (!rec) {
      return { vehicles: [], fuelEntries: [], expenseEntries: [], schemaVersion: SCHEMA_VERSION };
    }
    return validateAppData(rec);
  } catch (err) {
    console.error("[pitstop] loadData error:", err);
    // Return empty data rather than crashing; caller can show error state
    throw err;
  }
}

export async function saveData(data: AppData): Promise<SaveResult> {
  try {
    const store = await getStore();
    const result = await putRecord(store, RECORD_KEY, {
      ...data,
      schemaVersion: SCHEMA_VERSION,
    });
    if (!result.ok) {
      return { ok: false, reason: result.reason ?? "Storage write failed" };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  }
}

// ─── Selected vehicle preference ─────────────────────────────────────────────

const PREF_SELECTED_VEHICLE = "pitstop.selectedVehicleId";

export async function loadSelectedVehicleId(): Promise<string | null> {
  try {
    const r = await getPreference<string>(PREF_SELECTED_VEHICLE);
    return r.ok && r.value ? r.value : null;
  } catch {
    return null;
  }
}

export async function saveSelectedVehicleId(id: string | null): Promise<void> {
  try {
    await setPreference(PREF_SELECTED_VEHICLE, id ?? "");
  } catch {
    // non-critical
  }
}

// ─── Backup / export ──────────────────────────────────────────────────────────

export interface BackupPayload {
  appId: string;
  exportedAt: string;
  schemaVersion: number;
  data: AppData;
}

export function exportBackup(data: AppData): string {
  const payload: BackupPayload = {
    appId: "pitstop-log",
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    data,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseBackup(raw: string): { ok: true; payload: BackupPayload } | { ok: false; reason: string } {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.appId !== "pitstop-log") {
      return { ok: false, reason: "This backup is not from Pitstop Log." };
    }
    if (!parsed.data || typeof parsed.data !== "object") {
      return { ok: false, reason: "Backup has no data field." };
    }
    const data = validateAppData(parsed.data);
    return {
      ok: true,
      payload: {
        appId: "pitstop-log",
        exportedAt: isString(parsed.exportedAt) ? parsed.exportedAt : "",
        schemaVersion: isNumber(parsed.schemaVersion) ? parsed.schemaVersion : SCHEMA_VERSION,
        data,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Could not parse backup: ${msg}` };
  }
}
