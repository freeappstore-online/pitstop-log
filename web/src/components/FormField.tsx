interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}

export function FormField({ label, error, required, children, hint }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-[var(--ink)]">
        {label}
        {required && <span className="text-[var(--danger)] ml-0.5" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-[var(--muted)]">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-[var(--danger)] font-medium" role="alert">{error}</p>
      )}
    </div>
  );
}

export const inputClass =
  "w-full rounded-[0.75rem] border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent placeholder:text-[var(--muted)] min-h-[44px]";

export const selectClass =
  "w-full rounded-[0.75rem] border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent min-h-[44px]";
