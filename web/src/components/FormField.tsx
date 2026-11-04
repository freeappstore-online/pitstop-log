import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
interface FormFieldProps {
  label: string; error?: string; required?: boolean; children: ReactNode; hint?: string;
}
type ControlProps = {id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-required"?: boolean};
export function FormField({label,error,required,children,hint}: FormFieldProps) {
  const generatedId = useId();
  const control = isValidElement<ControlProps>(children) ? children : null;
  const id = control?.props.id ?? generatedId;
  const descriptionId = error ? id + "-error" : hint ? id + "-hint" : undefined;
  const describedBy = [control?.props["aria-describedby"],descriptionId].filter(Boolean).join(" ") || undefined;
  return <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-sm font-medium text-[var(--ink)]">{label}{required && <span className="text-[var(--danger)] ml-0.5" aria-hidden="true">*</span>}</label>
    {control ? cloneElement(control as ReactElement<ControlProps>, {id,"aria-describedby":describedBy,"aria-invalid":!!error,"aria-required":required}) : children}
    {hint && !error && <p id={id + "-hint"} className="text-xs text-[var(--muted)]">{hint}</p>}
    {error && <p id={id + "-error"} className="text-xs text-[var(--danger)] font-medium" role="alert">{error}</p>}
  </div>;
}
export const inputClass =
  "w-full rounded-[0.75rem] border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent placeholder:text-[var(--muted)] min-h-[44px]";

export const selectClass =
  "w-full rounded-[0.75rem] border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent min-h-[44px]";
