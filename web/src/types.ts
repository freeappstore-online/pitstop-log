// ─── Domain types ────────────────────────────────────────────────────────────

export interface Vehicle {
  id: string;
  name: string;       // e.g. "My Corolla"
  make: string;
  model: string;
  year: number | null;
  colour: string;
  createdAt: string;  // ISO
}

/** A fuel fill-up entry */
export interface FuelEntry {
  id: string;
  vehicleId: string;
  date: string;         // ISO date YYYY-MM-DD
  odometer: number;     // km — must be > previous entry for same vehicle
  litres: number;       // > 0
  totalCost: number;    // > 0
  fullTank: boolean;    // was this a full tank? needed for L/100km calc
  notes: string;
}

/** A general expense entry */
export interface ExpenseEntry {
  id: string;
  vehicleId: string;
  date: string;         // ISO date YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;       // > 0
  description: string;
}

export type ExpenseCategory =
  | "service"
  | "tyres"
  | "insurance"
  | "registration"
  | "parking"
  | "tolls"
  | "repairs"
  | "cleaning"
  | "other";

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "service",      label: "Service / Oil" },
  { value: "tyres",        label: "Tyres" },
  { value: "insurance",    label: "Insurance" },
  { value: "registration", label: "Registration" },
  { value: "parking",      label: "Parking" },
  { value: "tolls",        label: "Tolls" },
  { value: "repairs",      label: "Repairs" },
  { value: "cleaning",     label: "Cleaning" },
  { value: "other",        label: "Other" },
];

/** Root shape stored in IndexedDB */
export interface AppData {
  vehicles: Vehicle[];
  fuelEntries: FuelEntry[];
  expenseEntries: ExpenseEntry[];
  schemaVersion: number;
}

export const SCHEMA_VERSION = 1;

// ─── Computed stats ───────────────────────────────────────────────────────────

export interface ConsumptionInterval {
  fromOdometer: number;
  toOdometer: number;
  distanceKm: number;
  litres: number;
  l100km: number;
  date: string;
}

export interface VehicleStats {
  vehicleId: string;
  totalFuelCost: number;
  totalExpenseCost: number;
  totalCost: number;
  totalLitres: number;
  totalFuelEntries: number;
  totalExpenseEntries: number;
  consumption: ConsumptionInterval[];   // valid full-tank intervals only
  avgL100km: number | null;             // null = insufficient data
  lastOdometer: number | null;
}
