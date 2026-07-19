import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface rounded-card p-4 ${className}`}>{children}</div>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "surface" | "danger-ghost";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary:
      "bg-accent text-[#001427] font-semibold hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100",
    surface: "bg-surface2 text-text font-medium hover:bg-line disabled:opacity-50",
    "danger-ghost": "bg-transparent text-danger font-medium hover:bg-danger/10",
  }[variant];
  return (
    <button
      className={`rounded-full px-5 py-3 text-[15px] transition-all active:scale-[0.98] ${styles} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted/80">{hint}</span>}
    </label>
  );
}

const controlClass =
  "w-full rounded-control bg-surface2 px-3.5 py-3 text-[15px] text-text placeholder:text-muted/60 " +
  "outline-none border border-transparent focus:border-accent/60 transition-colors";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={controlClass} {...props} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${controlClass} appearance-none`} {...props}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
            value === option.value
              ? "bg-accent/15 text-accent border border-accent/50"
              : "bg-surface2 text-muted border border-transparent hover:text-text"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-[13px] text-danger">{children}</p>;
}

export function Spinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  );
}
