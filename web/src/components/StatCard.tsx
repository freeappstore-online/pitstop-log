interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: boolean;
}

export function StatCard({ label, value, sub, icon, accent }: StatCardProps) {
  return (
    <div className={`
      rounded-[1.25rem] p-4 flex flex-col gap-1
      ${accent
        ? "bg-[var(--accent)] text-white"
        : "bg-[var(--panel)] text-[var(--ink)]"
      }
    `}>
      {icon && (
        <div className={`text-xl mb-1 ${accent ? "opacity-90" : "text-[var(--accent)]"}`}>
          {icon}
        </div>
      )}
      <div className={`text-xs font-medium uppercase tracking-wide ${accent ? "opacity-80" : "text-[var(--muted)]"}`}>
        {label}
      </div>
      <div className={`text-xl font-bold font-[Fraunces,serif] ${accent ? "text-white" : "text-[var(--ink-strong,var(--ink))]"}`}>
        {value}
      </div>
      {sub && (
        <div className={`text-xs ${accent ? "opacity-70" : "text-[var(--muted)]"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}
