import { useState, useId } from "react";
import { PageHeader, useToast } from "@freeappstore/sdk/ui";
import type { AppData, Vehicle } from "../types";
import type { SaveResult } from "../db";
import { Modal } from "../components/Modal";
import { FormField, inputClass } from "../components/FormField";

interface Props {
  data: AppData;
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  onSave: (data: AppData) => Promise<SaveResult>;
  dirty: boolean;
  setDirty: (d: boolean) => void;
}

function uid() {
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface VehicleForm {
  name: string;
  make: string;
  model: string;
  year: string;
  colour: string;
}

const emptyForm = (): VehicleForm => ({
  name: "", make: "", model: "", year: "", colour: "",
});

function formFromVehicle(v: Vehicle): VehicleForm {
  return {
    name: v.name,
    make: v.make,
    model: v.model,
    year: v.year !== null ? String(v.year) : "",
    colour: v.colour,
  };
}

interface FormErrors {
  name?: string;
  make?: string;
  model?: string;
  year?: string;
}

function validateForm(f: VehicleForm): FormErrors {
  const errors: FormErrors = {};
  if (!f.name.trim()) errors.name = "Name is required";
  if (!f.make.trim()) errors.make = "Make is required";
  if (!f.model.trim()) errors.model = "Model is required";
  if (f.year.trim()) {
    const y = parseInt(f.year, 10);
    if (isNaN(y) || y < 1886 || y > new Date().getFullYear() + 2) {
      errors.year = "Enter a valid year (e.g. 2019)";
    }
  }
  return errors;
}

export function VehiclesScreen({ data, selectedVehicleId, onSelectVehicle, onSave, setDirty }: Props) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const formId = useId();

  const openAdd = () => {
    setForm(emptyForm());
    setErrors({});
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (v: Vehicle) => {
    setForm(formFromVehicle(v));
    setErrors({});
    setEditingId(v.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    const year = form.year.trim() ? parseInt(form.year, 10) : null;
    let newData: AppData;

    if (editingId) {
      newData = {
        ...data,
        vehicles: data.vehicles.map(v =>
          v.id === editingId
            ? { ...v, name: form.name.trim(), make: form.make.trim(), model: form.model.trim(), year, colour: form.colour.trim() }
            : v
        ),
      };
    } else {
      const vehicle: Vehicle = {
        id: uid(),
        name: form.name.trim(),
        make: form.make.trim(),
        model: form.model.trim(),
        year,
        colour: form.colour.trim(),
        createdAt: new Date().toISOString(),
      };
      newData = { ...data, vehicles: [...data.vehicles, vehicle] };
      // Auto-select first vehicle
      if (data.vehicles.length === 0) {
        onSelectVehicle(vehicle.id);
      }
    }

    const result = await onSave(newData);
    setSaving(false);
    if (result.ok) {
      toast.show(editingId ? "Vehicle updated" : "Vehicle added", { variant: "success" });
      setDirty(false);
      closeForm();
    } else {
      toast.show(`Save failed: ${result.reason}`, { variant: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    // Remove vehicle and all its entries
    const newData: AppData = {
      ...data,
      vehicles: data.vehicles.filter(v => v.id !== id),
      fuelEntries: data.fuelEntries.filter(e => e.vehicleId !== id),
      expenseEntries: data.expenseEntries.filter(e => e.vehicleId !== id),
    };
    const result = await onSave(newData);
    if (result.ok) {
      toast.show("Vehicle deleted", { variant: "success" });
      if (selectedVehicleId === id) {
        const remaining = newData.vehicles;
        onSelectVehicle(remaining.length > 0 ? remaining[0].id : "");
      }
    } else {
      toast.show(`Delete failed: ${result.reason}`, { variant: "error" });
    }
    setDeleteConfirm(null);
  };

  const setField = (k: keyof VehicleForm, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
    setDirty(true);
  };

  return (
    <div>
      <PageHeader title="Vehicles" />

      <div className="flex justify-end mb-4">
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-[var(--accent)] text-white px-4 py-2.5 rounded-[0.75rem] text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Add Vehicle
        </button>
      </div>

      {data.vehicles.length === 0 ? (
        <div className="rounded-[1.25rem] bg-[var(--panel)] p-8 text-center">
          <div className="text-4xl mb-3" aria-hidden="true">🚗</div>
          <p className="font-semibold text-[var(--ink)]">No vehicles yet</p>
          <p className="text-sm text-[var(--muted)] mt-1">Add your first vehicle to start tracking fuel and expenses.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" role="list">
          {data.vehicles.map(v => {
            const fuelCount = data.fuelEntries.filter(e => e.vehicleId === v.id).length;
            const expCount = data.expenseEntries.filter(e => e.vehicleId === v.id).length;
            const isSelected = v.id === selectedVehicleId;
            return (
              <li key={v.id} className={`
                rounded-[1.25rem] border-2 transition-colors
                ${isSelected ? "border-[var(--accent)] bg-[var(--accent-soft,var(--panel))]" : "border-[var(--line)] bg-[var(--panel)]"}
              `}>
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[var(--ink-strong,var(--ink))]">{v.name}</span>
                      {isSelected && (
                        <span className="text-xs bg-[var(--accent)] text-white px-2 py-0.5 rounded-full font-medium">Active</span>
                      )}
                    </div>
                    <div className="text-sm text-[var(--muted)] mt-0.5">
                      {[v.make, v.model, v.year].filter(Boolean).join(" · ")}
                      {v.colour && ` · ${v.colour}`}
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-1">
                      {fuelCount} fuel {fuelCount === 1 ? "entry" : "entries"} · {expCount} {expCount === 1 ? "expense" : "expenses"}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {!isSelected && (
                      <button
                        onClick={() => onSelectVehicle(v.id)}
                        className="min-w-[44px] min-h-[44px] px-3 rounded-[0.75rem] text-xs font-medium text-[var(--accent)] hover:bg-[var(--panel)] transition-colors border border-[var(--accent)]"
                        title="Set as active vehicle"
                      >
                        Select
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(v)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[0.75rem] text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors"
                      aria-label={`Edit ${v.name}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(v.id)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[0.75rem] text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft,#fee2e2)] transition-colors"
                      aria-label={`Delete ${v.name}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <Modal title={editingId ? "Edit Vehicle" : "Add Vehicle"} onClose={closeForm}>
          <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <FormField label="Nickname / Name" error={errors.name} required>
              <input
                className={inputClass}
                value={form.name}
                onChange={e => setField("name", e.target.value)}
                placeholder="My Corolla"
                autoComplete="off"
                required
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Make" error={errors.make} required>
                <input
                  className={inputClass}
                  value={form.make}
                  onChange={e => setField("make", e.target.value)}
                  placeholder="Toyota"
                  autoComplete="off"
                  required
                />
              </FormField>
              <FormField label="Model" error={errors.model} required>
                <input
                  className={inputClass}
                  value={form.model}
                  onChange={e => setField("model", e.target.value)}
                  placeholder="Corolla"
                  autoComplete="off"
                  required
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Year" error={errors.year}>
                <input
                  className={inputClass}
                  value={form.year}
                  onChange={e => setField("year", e.target.value)}
                  placeholder="2019"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </FormField>
              <FormField label="Colour">
                <input
                  className={inputClass}
                  value={form.colour}
                  onChange={e => setField("colour", e.target.value)}
                  placeholder="Silver"
                  autoComplete="off"
                />
              </FormField>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 py-2.5 rounded-[0.75rem] border border-[var(--line)] text-sm font-medium text-[var(--ink)] min-h-[44px] hover:bg-[var(--panel)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-[0.75rem] bg-[var(--accent)] text-white text-sm font-semibold min-h-[44px] hover:bg-[var(--accent-hover,var(--accent))] transition-colors disabled:opacity-60"
              >
                {saving ? "Saving…" : editingId ? "Save Changes" : "Add Vehicle"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (() => {
        const v = data.vehicles.find(x => x.id === deleteConfirm);
        if (!v) return null;
        const fuelCount = data.fuelEntries.filter(e => e.vehicleId === v.id).length;
        const expCount = data.expenseEntries.filter(e => e.vehicleId === v.id).length;
        return (
          <Modal title="Delete Vehicle?" onClose={() => setDeleteConfirm(null)}>
            <p className="text-sm text-[var(--ink)] mb-2">
              Permanently delete <strong>{v.name}</strong>?
            </p>
            {(fuelCount > 0 || expCount > 0) && (
              <p className="text-sm text-[var(--danger)] mb-4">
                This will also delete {fuelCount} fuel {fuelCount === 1 ? "entry" : "entries"} and {expCount} {expCount === 1 ? "expense" : "expenses"}.
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-[0.75rem] border border-[var(--line)] text-sm font-medium min-h-[44px] hover:bg-[var(--panel)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 rounded-[0.75rem] bg-[var(--danger)] text-white text-sm font-semibold min-h-[44px] hover:opacity-90 transition-opacity"
              >
                Delete
              </button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
