"use client";

// NOT-IN-DS: Form (del DS) solo trae FormField para <input> de texto/número —
// no hay variante para <select> ni <textarea>. Estos stubs reutilizan las
// mismas clases CSS que el DS ya define para FormField (ds-form-field,
// ds-form-field__label, ds-form-field__input) para que visualmente sean
// indistinguibles, sin inventar tokens nuevos.

import type { ChangeEvent } from "react";

export interface OpcionSelect {
  value: string;
  label: string;
}

export function FormSelect({
  label,
  value,
  onChange,
  options,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: OpcionSelect[];
  placeholder?: string;
}) {
  return (
    <div className="ds-form-field ds-form-field--standard" style={{ width: "100%" }}>
      <label className="ds-form-field__label">{label}</label>
      <div className="ds-form-field__input-wrap">
        <select className="ds-form-field__input" value={value} onChange={onChange}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function FormDate({ label, value, onChange }: { label: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="ds-form-field ds-form-field--standard" style={{ width: "100%" }}>
      <label className="ds-form-field__label">{label}</label>
      <div className="ds-form-field__input-wrap">
        <input type="date" className="ds-form-field__input" value={value} onChange={onChange} />
      </div>
    </div>
  );
}

export function FormTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="ds-form-field ds-form-field--standard" style={{ width: "100%" }}>
      <label className="ds-form-field__label">{label}</label>
      <div className="ds-form-field__input-wrap" style={{ height: "auto" }}>
        <textarea
          className="ds-form-field__input"
          style={{ height: "auto", borderRadius: "var(--ds-radius-lg)", resize: "vertical", paddingTop: 10, paddingBottom: 10 }}
          rows={rows}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
