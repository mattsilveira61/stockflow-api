import clsx from "clsx";
import { Loader2, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  icon: Icon,
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  icon?: LucideIcon;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={clsx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[3px] px-3.5 text-sm font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" &&
          "bg-ink text-paper shadow-[3px_3px_0_var(--signal)] hover:-translate-y-px hover:shadow-[4px_4px_0_var(--signal)] active:translate-y-0 active:shadow-[1px_1px_0_var(--signal)]",
        variant === "ghost" && "border border-line-strong text-ink hover:border-ink hover:bg-sunken",
        variant === "danger" && "bg-danger text-white hover:brightness-110",
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className="size-4" strokeWidth={2.2} />}
      {children}
    </button>
  );
}

export function Card({ title, action, className, children }: { title?: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={clsx("rounded-[4px] border border-line bg-panel", className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="label !text-ink-2">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Spinner({ label = "Carregando" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 p-10 text-ink-3">
      <Loader2 className="size-4 animate-spin" />
      <span className="label">{label}…</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Icon className="size-6 text-ink-3" strokeWidth={1.6} />
      <p className="font-semibold text-ink-2">{title}</p>
      {children && <p className="max-w-xs text-sm text-ink-3">{children}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-4 flex flex-wrap items-center gap-3 rounded-[3px] border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
      <span className="font-semibold">{error.message}</span>
      {onRetry && (
        <button onClick={onRetry} className="underline underline-offset-2">
          Tentar de novo
        </button>
      )}
    </div>
  );
}

type Tone = "ok" | "warn" | "danger" | "neutral" | "signal";

const TONES: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-sunken text-ink-2",
  signal: "bg-signal-soft text-signal-ink",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={clsx("label inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 !text-[0.625rem] font-medium", TONES[tone])}>
      {children}
    </span>
  );
}

/** Selo de estoque: zerado, baixo (<= mínimo) ou ok. */
export function StockBadge({ quantity, min }: { quantity: number; min: number }) {
  if (quantity === 0) return <Badge tone="danger">Zerado</Badge>;
  if (quantity <= min) return <Badge tone="warn">Baixo</Badge>;
  return <Badge tone="ok">Ok</Badge>;
}

export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[3px] border border-line-strong p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "num rounded-[2px] px-2.5 py-1 text-xs transition",
            o.value === value ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
