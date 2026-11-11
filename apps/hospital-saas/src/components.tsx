import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, LoaderCircle, Leaf, Check } from "lucide-react";
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Leaf size={24} />
      </span>
      <div>
        vaidya<span>THE CARE WORKSPACE</span>
      </div>
      <i>®</i>
    </div>
  );
}
export function Button({
  children,
  onClick,
  kind = "",
  disabled = false,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      className={`button ${kind}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    heading = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current
      ?.querySelector<HTMLElement>("input,select,textarea,button")
      ?.focus();
    const key = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        ref={ref}
      >
        <header>
          <div>
            <span className="eyebrow">PATIENT CARE</span>
            <h2 id={heading}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
export type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  full?: boolean;
  placeholder?: string;
};
export function DataForm({
  fields,
  initial = {},
  onSubmit,
  submitLabel = "Save changes",
  onCancel,
  onFieldChange,
}: {
  fields: Field[];
  initial?: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  submitLabel?: string;
  onCancel?: () => void;
  onFieldChange?: (key: string, value: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const prefix = useId();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setError("");
        setBusy(true);
        const data = new FormData(e.currentTarget);
        const values: Record<string, unknown> = {};
        for (const f of fields) {
          const value = String(data.get(f.key) ?? "").trim();
          values[f.key] =
            f.type === "number" ? (value === "" ? null : Number(value)) : value;
        }
        try {
          await onSubmit(values);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <label
            key={f.key}
            className={f.full ? "full" : ""}
            htmlFor={`${prefix}-${f.key}`}
          >
            {f.label}
            {f.required && (
              <span className="required" aria-hidden="true">
                {" "}
                *
              </span>
            )}
            {f.type === "textarea" ? (
              <textarea
                aria-label={f.label}
                id={`${prefix}-${f.key}`}
                name={f.key}
                rows={4}
                maxLength={5000}
                defaultValue={String(initial[f.key] ?? "")}
                required={f.required}
                placeholder={f.placeholder}
              />
            ) : f.options ? (
              <select
                aria-label={f.label}
                id={`${prefix}-${f.key}`}
                name={f.key}
                defaultValue={String(initial[f.key] ?? f.options[0])}
                onChange={(e) => onFieldChange?.(f.key, e.target.value)}
              >
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                aria-label={f.label}
                id={`${prefix}-${f.key}`}
                name={f.key}
                type={f.type ?? "text"}
                defaultValue={String(initial[f.key] ?? "")}
                required={f.required}
                min={f.min}
                max={f.max}
                step={f.step ?? (f.type === "number" ? "any" : undefined)}
                maxLength={f.type === "password" ? 256 : 1000}
                placeholder={f.placeholder}
                onChange={(e) => onFieldChange?.(f.key, e.target.value)}
              />
            )}
          </label>
        ))}
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions">
        {onCancel && (
          <Button kind="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}{" "}
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
export function Empty({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Leaf size={26} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {children}
    </div>
  );
}
export function Pill({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
