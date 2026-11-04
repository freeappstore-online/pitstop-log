import { useState, useId } from "react";
import { PageHeader, useToast } from "@freeappstore/sdk/ui";
import type { AppData, FuelEntry, ExpenseEntry, Vehicle } from "../types";
import { EXPENSE_CATEGORIES } from "../types";
import type { SaveResult } from "../db";
import { Modal } from "../components/Modal";
import { FormField, inputClass, selectClass } from "../components/FormField";
import { fmtCurrency } from "../stats";

interface Props {
  data: AppData;
  selectedVehicleId: string | null;
  onSave: (data: AppData) => Promise<SaveResult>;
  dirty: boolean;
  setDirty: (d: boolean) => void;
  onNavigateVehicles: () => void;
}

type Tab = "fuel" | "expenses";

function uid() {
  return `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Fuel form ────────────────────────────────────────────────────────────────

interface FuelForm {
  date: string;
  odometer: string;
  litres: string;
  totalCost: string;
  fullTank: boolean;
  notes: string;
}

interface FuelErrors {
  date?: string;
  odometer?: string;
  litres?: string;
  totalCost?: string;
}

function emptyFuelForm(): FuelForm {
  return {
    date: new Date().toISOString().slice(0, 10),
    odometer: "",
    litres: "",
    totalCost: "",
    fullTank: true,
    notes: "",
  };
}

function formFromFuel(e: FuelEntry): FuelForm {
  return {
    date: e.date,
    odometer: String(e.odometer),
    litres: String(e.litres),
    totalCost: String(e.totalCost),
    fullTank: e.fullTank,
    notes: e.notes,
  };
}

function validateFuelForm(f: FuelForm, vehicleId: string, data: AppData, editingId: string | null): FuelErrors {
  const errs: FuelErrors = {};
  if (!f.date) { errs.date = "Date is required"; }

  const odo = parseFloat(f.odometer);
  if (f.odometer.trim() === "" || isNaN(odo) || odo < 0) {
    errs.odometer = "Enter a valid odometer reading (km)";
  } else {
    // Check ordering: must be greater than the previous entry for this vehicle (excluding self)
    const others = data.fuelEntries
      .filter(e => e.vehicleId === vehicleId && e.id !== editingId)
      .sort((a, b) => a.odometer - b.odometer);
    // Find entries that would be "before" and "after" this one
    const before = others.filter(e => e.date <= f.date);
    const maxBefore = before.length > 0 ? Math.max(...before.map(e => e.odometer)) : -Infinity;
    const after = others.filter(e => e.date > f.date);
    const minAfter = after.length > 0 ? Math.min(...after.map(e => e.odometer)) : Infinity;

    if (odo <= maxBefore) {
      errs.odometer = `Odometer must be greater than previous reading (${maxBefore} km)`;
    } else if (odo >= minAfter) {
      errs.odometer = `Odometer must be less than next reading (${minAfter} km)`;
    }
  }

  const litres = parseFloat(f.litres);
  if (f.litres.trim() === "" || isNaN(litres) || litres <= 0) {
    errs.litres = "Enter a positive number of litres";
  }

  const cost = parseFloat(f.totalCost);
  if (f.totalCost.trim() === "" || isNaN(cost) || cost <= 0) {
    errs.totalCost = "Enter a positive total cost";
  }

  return errs;
}

// ─── Expense form ─────────────────────────────────────────────────────────────

interface ExpenseForm {
  date: string;
  category: string;
  amount: string;
  description: string;
}

interface ExpenseErrors {
  date?: string;
  category?: string;
  amount?: string;
}

function emptyExpenseForm(): ExpenseForm {
  return {
    date: new Date().toISOString().slice(0, 10),
    category: "service",
    amount: "",
    description: "",
  };
}

function formFromExpense(e: ExpenseEntry): ExpenseForm {
  return {
    date: e.date,
    category: e.category,
    amount: String(e.amount),
    description: e.description,
  };
}

function validateExpenseForm(f: ExpenseForm): ExpenseErrors {
  const errs: ExpenseErrors = {};
  if (!f.date) errs.date = "Date is required";
  if (!f.category) errs.category = "Category is required";
  const amount = parseFloat(f.amount);
  if (f.amount.trim() === "" || isNaN(amount) || amount <= 0) {
    errs.amount = "Enter a positive amount";
  }
  return errs;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LogScreen({ data, selectedVehicleId, onSave, setDirty, onNavigateVehicles }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("fuel");
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [editingFuelId, setEditingFuelId] = useState<string | null>(null);
  const [fuelForm, setFuelForm] = useState<FuelForm>(emptyFuelForm());
  const [fuelErrors, setFuelErrors] = useState<FuelErrors>({});
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm());
  const [expenseErrors, setExpenseErrors] = useState<ExpenseErrors>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "fuel" | "expense"; id: string } | null>(null);
  const fuelFormId = useId();
  const expFormId = useId();

  const vehicle: Vehicle | undefined = data.vehicles.find(v => v.id === selectedVehicleId);

  // ── Fuel ──────────────────────────────────────────────────────────────────

  const fuelEntries = data.fuelEntries
    .filter(e => e.vehicleId === selectedVehicleId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer);

  const openAddFuel = () => {
    setFuelForm(emptyFuelForm());
    setFuelErrors({});
    setEditingFuelId(null);
    setShowFuelForm(true);
  };

  const openEditFuel = (e: FuelEntry) => {
    setFuelForm(formFromFuel(e));
    setFuelErrors({});
    setEditingFuelId(e.id);
    setShowFuelForm(true);
  };

  const handleFuelSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!selectedVehicleId) return;
    const errs = validateFuelForm(fuelForm, selectedVehicleId, data, editingFuelId);
    if (Object.keys(errs).length > 0) { setFuelErrors(errs); return; }
    setSaving(true);

    const entry: FuelEntry = {
      id: editingFuelId ?? uid(),
      vehicleId: selectedVehicleId,
      date: fuelForm.date,
      odometer: parseFloat(fuelForm.odometer),
      litres: parseFloat(fuelForm.litres),
      totalCost: parseFloat(fuelForm.totalCost),
      fullTank: fuelForm.fullTank,
      notes: fuelForm.notes.trim(),
    };

    const newData: AppData = {
      ...data,
      fuelEntries: editingFuelId
        ? data.fuelEntries.map(e => e.id === editingFuelId ? entry : e)
        : [...data.fuelEntries, entry],
    };

    const result = await onSave(newData);
    setSaving(false);
    if (result.ok) {
      toast.show(editingFuelId ? "Fuel entry updated" : "Fuel entry added", { variant: "success" });
      setDirty(false);
      setShowFuelForm(false);
    } else {
      toast.show(`Save failed: ${result.reason}`, { variant: "error" });
    }
  };

  const setFuelField = <K extends keyof FuelForm>(k: K, v: FuelForm[K]) => {
    setFuelForm(f => ({ ...f, [k]: v }));
    setFuelErrors(e => ({ ...e, [k]: undefined }));
    setDirty(true);
  };

  // ── Expenses ──────────────────────────────────────────────────────────────

  const expenseEntries = data.expenseEntries
    .filter(e => e.vehicleId === selectedVehicleId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const openAddExpense = () => {
    setExpenseForm(emptyExpenseForm());
    setExpenseErrors({});
    setEditingExpenseId(null);
    setShowExpenseForm(true);
  };

  const openEditExpense = (e: ExpenseEntry) => {
    setExpenseForm(formFromExpense(e));
    setExpenseErrors({});
    setEditingExpenseId(e.id);
    setShowExpenseForm(true);
  };

  const handleExpenseSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!selectedVehicleId) return;
    const errs = validateExpenseForm(expenseForm);
    if (Object.keys(errs).length > 0) { setExpenseErrors(errs); return; }
    setSaving(true);

    const entry: ExpenseEntry = {
      id: editingExpenseId ?? uid(),
      vehicleId: selectedVehicleId,
      date: expenseForm.date,
      category: expenseForm.category as ExpenseEntry["category"],
      amount: parseFloat(expenseForm.amount),
      description: expenseForm.description.trim(),
    };

    const newData: AppData = {
      ...data,
      expenseEntries: editingExpenseId
        ? data.expenseEntries.map(e => e.id === editingExpenseId ? entry : e)
        : [...data.expenseEntries, entry],
    };

    const result = await onSave(newData);
    setSaving(false);
    if (result.ok) {
      toast.show(editingExpenseId ? "Expense updated" : "Expense added", { variant: "success" });
      setDirty(false);
      setShowExpenseForm(false);
    } else {
      toast.show(`Save failed: ${result.reason}`, { variant: "error" });
    }
  };

  const setExpField = <K extends keyof ExpenseForm>(k: K, v: ExpenseForm[K]) => {
    setExpenseForm(f => ({ ...f, [k]: v }));
    setExpenseErrors(e => ({ ...e, [k]: undefined }));
    setDirty(true);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    let newData: AppData;
    if (deleteTarget.kind === "fuel") {
      newData = { ...data, fuelEntries: data.fuelEntries.filter(e => e.id !== deleteTarget.id) };
    } else {
      newData = { ...data, expenseEntries: data.expenseEntries.filter(e => e.id !== deleteTarget.id) };
    }
    const result = await onSave(newData);
    if (result.ok) {
      toast.show("Entry deleted", { variant: "success" });
    } else {
      toast.show(`Delete failed: ${result.reason}`, { variant: "error" });
    }
    setDeleteTarget(null);
  };

  // ── No vehicle state ──────────────────────────────────────────────────────

  if (!vehicle) {
    return (
      <div>
        <PageHeader title="Log" />
        <div className="rounded-[1.25rem] bg-[var(--panel)] p-8 text-center">
          <div className="text-4xl mb-3" aria-hidden="true">⛽</div>
          <p className="font-semibold text-[var(--ink)]">No vehicle selected</p>
          <p className="text-sm text-[var(--muted)] mt-1 mb-4">Add a vehicle first to log fuel and expenses.</p>
          <button
            onClick={onNavigateVehicles}
            className="bg-[var(--accent)] text-white px-5 py-2.5 rounded-[0.75rem] text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors"
          >
            Go to Vehicles
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Log" />

      {/* Vehicle badge + tab bar + add button */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs bg-[var(--panel)] border border-[var(--line)] text-[var(--muted)] px-3 py-1 rounded-full font-medium">
          {vehicle.name}
        </span>
        <div className="flex gap-1 bg-[var(--panel)] rounded-[0.75rem] p-1 ml-auto">
          {(["fuel", "expenses"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-[0.5rem] text-sm font-medium min-h-[36px] transition-colors capitalize
                ${tab === t
                  ? "bg-[var(--paper)] text-[var(--ink-strong,var(--ink))] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              aria-pressed={tab === t}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={tab === "fuel" ? openAddFuel : openAddExpense}
          className="flex items-center gap-1.5 bg-[var(--accent)] text-white px-4 py-2 rounded-[0.75rem] text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors"
          aria-label={tab === "fuel" ? "Add fuel entry" : "Add expense"}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Add
        </button>
      </div>

      {/* ── Fuel list ── */}
      {tab === "fuel" && (
        fuelEntries.length === 0 ? (
          <div className="rounded-[1.25rem] bg-[var(--panel)] p-8 text-center">
            <div className="text-4xl mb-3" aria-hidden="true">⛽</div>
            <p className="font-semibold text-[var(--ink)]">No fuel entries yet</p>
            <p className="text-sm text-[var(--muted)] mt-1">Log your first fill-up to start tracking consumption.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" role="list">
            {fuelEntries.map(e => (
              <li key={e.id} className="rounded-[1.25rem] bg-[var(--panel)] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-[var(--ink-strong,var(--ink))]">
                        {e.odometer.toLocaleString()} km
                      </span>
                      <span className="text-xs text-[var(--muted)]">{e.date}</span>
                      {!e.fullTank && (
                        <span className="text-xs bg-[var(--warning-soft,#fef3c7)] text-[var(--warning,#b45309)] px-2 py-0.5 rounded-full">Partial</span>
                      )}
                    </div>
                    <div className="text-sm text-[var(--muted)] mt-0.5">
                      {e.litres.toFixed(2)} L · {fmtCurrency(e.totalCost)}
                      {e.litres > 0 && (
                        <span className="ml-2 text-xs">({(e.totalCost / e.litres).toFixed(3)}/L)</span>
                      )}
                    </div>
                    {e.notes && (
                      <div className="text-xs text-[var(--muted)] mt-1 italic">{e.notes}</div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEditFuel(e)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[0.75rem] text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors"
                      aria-label="Edit fuel entry"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ kind: "fuel", id: e.id })}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[0.75rem] text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft,#fee2e2)] transition-colors"
                      aria-label="Delete fuel entry"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {/* ── Expenses list ── */}
      {tab === "expenses" && (
        expenseEntries.length === 0 ? (
          <div className="rounded-[1.25rem] bg-[var(--panel)] p-8 text-center">
            <div className="text-4xl mb-3" aria-hidden="true">🧾</div>
            <p className="font-semibold text-[var(--ink)]">No expenses yet</p>
            <p className="text-sm text-[var(--muted)] mt-1">Log services, tyres, insurance and other running costs.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" role="list">
            {expenseEntries.map(e => {
              const cat = EXPENSE_CATEGORIES.find(c => c.value === e.category);
              return (
                <li key={e.id} className="rounded-[1.25rem] bg-[var(--panel)] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-[var(--ink-strong,var(--ink))]">
                          {fmtCurrency(e.amount)}
                        </span>
                        <span className="text-xs bg-[var(--accent-soft,#eff6ff)] text-[var(--accent)] px-2 py-0.5 rounded-full font-medium">
                          {cat?.label ?? e.category}
                        </span>
                        <span className="text-xs text-[var(--muted)]">{e.date}</span>
                      </div>
                      {e.description && (
                        <div className="text-sm text-[var(--muted)] mt-0.5">{e.description}</div>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEditExpense(e)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[0.75rem] text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors"
                        aria-label="Edit expense"
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ kind: "expense", id: e.id })}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[0.75rem] text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft,#fee2e2)] transition-colors"
                        aria-label="Delete expense"
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}

      {/* ── Fuel form modal ── */}
      {showFuelForm && (
        <Modal title={editingFuelId ? "Edit Fuel Entry" : "Add Fuel Entry"} onClose={() => { setShowFuelForm(false); setDirty(false); }}>
          <form id={fuelFormId} onSubmit={handleFuelSubmit} noValidate className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Date" error={fuelErrors.date} required>
                <input
                  type="date"
                  className={inputClass}
                  value={fuelForm.date}
                  onChange={e => setFuelField("date", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Odometer (km)" error={fuelErrors.odometer} required>
                <input
                  className={inputClass}
                  value={fuelForm.odometer}
                  onChange={e => setFuelField("odometer", e.target.value)}
                  placeholder="45000"
                  inputMode="decimal"
                  required
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Litres" error={fuelErrors.litres} required>
                <input
                  className={inputClass}
                  value={fuelForm.litres}
                  onChange={e => setFuelField("litres", e.target.value)}
                  placeholder="42.5"
                  inputMode="decimal"
                  required
                />
              </FormField>
              <FormField label="Total Cost ($)" error={fuelErrors.totalCost} required>
                <input
                  className={inputClass}
                  value={fuelForm.totalCost}
                  onChange={e => setFuelField("totalCost", e.target.value)}
                  placeholder="72.25"
                  inputMode="decimal"
                  required
                />
              </FormField>
            </div>
            <FormField label="Notes">
              <input
                className={inputClass}
                value={fuelForm.notes}
                onChange={e => setFuelField("notes", e.target.value)}
                placeholder="Optional notes"
              />
            </FormField>
            <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={fuelForm.fullTank}
                onChange={e => setFuelField("fullTank", e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <span className="text-sm font-medium text-[var(--ink)]">Full tank</span>
              <span className="text-xs text-[var(--muted)]">(required for L/100km calculation)</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowFuelForm(false); setDirty(false); }}
                className="flex-1 py-2.5 rounded-[0.75rem] border border-[var(--line)] text-sm font-medium min-h-[44px] hover:bg-[var(--panel)] transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-[0.75rem] bg-[var(--accent)] text-white text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors disabled:opacity-60">
                {saving ? "Saving…" : editingFuelId ? "Save Changes" : "Add Entry"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Expense form modal ── */}
      {showExpenseForm && (
        <Modal title={editingExpenseId ? "Edit Expense" : "Add Expense"} onClose={() => { setShowExpenseForm(false); setDirty(false); }}>
          <form id={expFormId} onSubmit={handleExpenseSubmit} noValidate className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Date" error={expenseErrors.date} required>
                <input
                  type="date"
                  className={inputClass}
                  value={expenseForm.date}
                  onChange={e => setExpField("date", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Amount ($)" error={expenseErrors.amount} required>
                <input
                  className={inputClass}
                  value={expenseForm.amount}
                  onChange={e => setExpField("amount", e.target.value)}
                  placeholder="185.00"
                  inputMode="decimal"
                  required
                />
              </FormField>
            </div>
            <FormField label="Category" error={expenseErrors.category} required>
              <select
                className={selectClass}
                value={expenseForm.category}
                onChange={e => setExpField("category", e.target.value)}
                required
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Description">
              <input
                className={inputClass}
                value={expenseForm.description}
                onChange={e => setExpField("description", e.target.value)}
                placeholder="Optional description"
              />
            </FormField>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowExpenseForm(false); setDirty(false); }}
                className="flex-1 py-2.5 rounded-[0.75rem] border border-[var(--line)] text-sm font-medium min-h-[44px] hover:bg-[var(--panel)] transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-[0.75rem] bg-[var(--accent)] text-white text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors disabled:opacity-60">
                {saving ? "Saving…" : editingExpenseId ? "Save Changes" : "Add Expense"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <Modal title="Delete Entry?" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-[var(--ink)] mb-4">This entry will be permanently deleted.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)}
              className="flex-1 py-2.5 rounded-[0.75rem] border border-[var(--line)] text-sm font-medium min-h-[44px] hover:bg-[var(--panel)] transition-colors">
              Cancel
            </button>
            <button onClick={handleDelete}
              className="flex-1 py-2.5 rounded-[0.75rem] bg-[var(--danger)] text-white text-sm font-semibold min-h-[44px] hover:opacity-90 transition-opacity">
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
