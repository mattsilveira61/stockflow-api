import clsx from "clsx";
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const control =
  "w-full rounded-[3px] border bg-paper px-3 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-ink disabled:opacity-60";

type FieldProps = { label: string; error?: string; hint?: ReactNode; className?: string };

function FieldShell({ id, label, error, hint, className, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label mb-1.5 block">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-msg`} className="mt-1 text-xs text-ink-3">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function TextField({ label, error, hint, className, ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        {...props}
        className={clsx(control, "h-9", error ? "border-danger" : "border-line-strong", props.inputMode && "num")}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <select
        id={id}
        aria-invalid={!!error}
        {...props}
        className={clsx(control, "h-9 cursor-pointer", error ? "border-danger" : "border-line-strong")}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({ label, error, hint, className, ...props }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <textarea
        id={id}
        rows={3}
        aria-invalid={!!error}
        {...props}
        className={clsx(control, "resize-y py-2", error ? "border-danger" : "border-line-strong")}
      />
    </FieldShell>
  );
}

/** Interruptor liga/desliga (checkbox estilizado). */
export function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[3px] border border-line p-3 hover:border-line-strong">
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={clsx(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition peer-focus-visible:outline-2 peer-focus-visible:outline-signal",
          checked ? "bg-ok" : "bg-line-strong",
        )}
      >
        <span className={clsx("absolute top-0.5 size-4 rounded-full bg-paper transition-all", checked ? "left-[1.125rem]" : "left-0.5")} />
      </span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="block text-xs text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-[3px] border border-danger/40 bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
      {message}
    </div>
  );
}
