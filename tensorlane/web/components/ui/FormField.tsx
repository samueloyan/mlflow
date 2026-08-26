import type { ReactNode } from "react";

export function FormField({
  label,
  htmlFor,
  description,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  description?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span>{label}</span>
      {children}
      {description && !error ? <p className="field-help">{description}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </label>
  );
}
