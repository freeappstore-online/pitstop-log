/**
 * Device-local persistence via @freeappstore/sdk/persist (IndexedDB).
 * All reads/writes go through validated helpers; errors are surfaced to callers.
 */
import { openStore, getRecord, putRecord, getPreference, setPreference, type LocalStore } from "@freeappstore/sdk/persist";
import type { AppData, Vehicle, FuelEntry, ExpenseEntry } from "./types";
import { SCHEMA_VERSION } from "./types";
import { exportBackup as makeBackup, previewBackup, importBackup, shareOrDownloadBackup, type BackupSchema } from "@freeappstore/sdk/backup";

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

function validDate(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function validateAppData(raw: unknown): AppData {
  if (!raw || typeof raw !== "object") throw new Error("Invalid data: expected an object.");
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported data version.");
  if (!Array.isArray(o.vehicles) || !o.vehicles.every(validateVehicle) ||
      !Array.isArray(o.fuelEntries) || !o.fuelEntries.every(validateFuelEntry) ||
      !Array.isArray(o.expenseEntries) || !o.expenseEntries.every(validateExpenseEntry)) {
    throw new Error("Invalid records. No data was imported.");
  }
  const vehicles = o.vehicles as Vehicle[], fuelEntries = o.fuelEntries as FuelEntry[],
    expenseEntries = o.expenseEntries as ExpenseEntry[];
  for (const rows of [vehicles, fuelEntries, expenseEntries]) {
    if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Duplicate record IDs.");
  }
  const ids = new Set(vehicles.map(v => v.id));
  if (vehicles.some(v => !v.name.trim() || (v.year !== null && (!Number.isInteger(v.year) || v.year < 1886 || v.year > new Date().getFullYear() + 1)))) throw new Error("Invalid vehicle.");
  if (fuelEntries.some(e => !ids.has(e.vehicleId) || !validDate(e.date)) ||
      expenseEntries.some(e => !ids.has(e.vehicleId) || !validDate(e.date) ||
      !["service","tyres","insurance","registration","parking","tolls","repairs","cleaning","other"].includes(e.category))) {
    throw new Error("Invalid date, category or vehicle reference.");
  }
  for (const id of ids) {
    const entries = fuelEntries.filter(e => e.vehicleId === id).sort((x,y) => x.date.localeCompare(y.date) || x.odometer-y.odometer);
    if (entries.some((e,i) => i > 0 && e.odometer < entries[i-1].odometer)) throw new Error("Odometers must follow date order.");
  }
  return { vehicles, fuelEntries, expenseEntries, schemaVersion: SCHEMA_VERSION };
}

const backupSchema: BackupSchema<AppData> = {
  supportedVersions: [SCHEMA_VERSION],
  validate: (value): value is AppData => { try { validateAppData(value); return true; } catch { return false; } },
  counts: data => ({ vehicles: data.vehicles.length, fuelEntries: data.fuelEntries.length, expenses: data.expenseEntries.length }),
};
const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

// ─── Store helpers ────────────────────────────────────────────────────────────

export type SaveResult = { ok: true } | { ok: false; reason: string };

let _store: LocalStore | null = null;
let opening: Promise<LocalStore> | null = null;

async function getStore(): Promise<LocalStore> {
  if (_store) return _store;
  if (!opening) {
    opening = (async () => {
      const result = await openStore({ namespace: STORE_NAME, version: 1 });
      if (!result.ok) throw new Error(result.detail ?? result.reason);
      _store = result.value;
      return result.value;
    })();
  }
  try { return await opening; }
  finally { opening = null; }
}

export async function loadData(): Promise<AppData> {
  try {
    const store = await getStore();
    const result = await getRecord<AppData>(store, RECORD_KEY);
    if (!result.ok) throw new Error(result.detail ?? result.reason);
    const rec = result.value;
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
    validateAppData(data);
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
    const r = await getPreference<string>(STORE_NAME, PREF_SELECTED_VEHICLE);
    return r.ok && r.value ? r.value : null;
  } catch {
    return null;
  }
}

export async function saveSelectedVehicleId(id: string | null): Promise<void> {
  try {
    await setPreference(STORE_NAME, PREF_SELECTED_VEHICLE, id ?? "");
  } catch {
    // non-critical
  }
}

// ─── Backup / export ──────────────────────────────────────────────────────────

export interface BackupPayload {
  appId: string; exportedAt: string; schemaVersion: number; data: AppData;
}
export type ParsedBackup = { ok: true; payload: BackupPayload; raw: string } | { ok: false; reason: string };

export async function exportBackup(data: AppData): Promise<string> {
  validateAppData(data);
  const result = await makeBackup({ appId: "pitstop-log", data, version: SCHEMA_VERSION, maxBytes: MAX_BACKUP_BYTES });
  if (!result.ok) throw new Error(result.detail ?? "Backup export failed.");
  return JSON.stringify(result.value, null, 2);
}

export async function downloadBackup(data: AppData): Promise<void> {
  const envelope = JSON.parse(await exportBackup(data));
  const result = await shareOrDownloadBackup({ envelope });
  if (!result.ok) throw new Error(result.detail ?? "Backup download failed.");
  if (result.value.method === "text") throw new Error("This browser cannot download a file. Please use a browser with file downloads.");
}

export async function parseBackup(raw: string): Promise<ParsedBackup> {
  try {
    if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) throw new Error("Backup exceeds the 2 MB limit.");
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.appId !== "pitstop-log") throw new Error("This backup is not from Pitstop Log.");
    // Migrate the app's original v1 exports after strict validation; no records are discarded.
    let envelope = parsed;
    if (!parsed.format) {
      if (parsed.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported backup version.");
      const data = validateAppData(parsed.data);
      const converted = await makeBackup({ appId: "pitstop-log", data, version: SCHEMA_VERSION,
        exportedAt: parsed.exportedAt || undefined, maxBytes: MAX_BACKUP_BYTES });
      if (!converted.ok) throw new Error(converted.detail ?? "Invalid legacy backup.");
      envelope = converted.value;
    }
    const inspected = await previewBackup(envelope, backupSchema, MAX_BACKUP_BYTES);
    if (!inspected.ok) throw new Error(inspected.detail ?? "Invalid backup.");
    return { ok: true, raw: JSON.stringify(envelope), payload: { appId: "pitstop-log",
      exportedAt: envelope.exportedAt, schemaVersion: SCHEMA_VERSION, data: inspected.value.data } };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not read backup." };
  }
}

export async function restoreBackup(preview: Extract<ParsedBackup, {ok: true}>,
  mode: "merge" | "replace", save: (data: AppData) => Promise<SaveResult>): Promise<SaveResult> {
  let snapshot: AppData;
  const write = async (data: AppData) => { const result = await save(data); if (!result.ok) throw new Error(result.reason); };
  const result = await importBackup({
    raw: preview.raw, mode, schema: backupSchema, maxBytes: MAX_BACKUP_BYTES,
    snapshot: async () => { snapshot = await loadData(); return snapshot; },
    apply: async (incoming, selectedMode) => {
      const mergeRows = <T extends {id: string}>(old: T[], added: T[]) => {
        const existing = new Set(old.map(r => r.id)); return [...old, ...added.filter(r => !existing.has(r.id))];
      };
      const next = selectedMode === "replace" ? incoming : {
        schemaVersion: SCHEMA_VERSION, vehicles: mergeRows(snapshot.vehicles, incoming.vehicles),
        fuelEntries: mergeRows(snapshot.fuelEntries, incoming.fuelEntries),
        expenseEntries: mergeRows(snapshot.expenseEntries, incoming.expenseEntries),
      };
      validateAppData(next); await write(next);
    },
    restore: write,
  });
  return result.ok ? {ok: true} : {ok: false, reason: result.detail ?? "Import failed. Check your data before retrying."};
}
