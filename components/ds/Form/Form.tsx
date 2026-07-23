'use client';
import React from "react";
import { motion } from "motion/react";
import { Icon, type IconName } from "../Icon/Icon";
import { springs } from "../springs";

// ─── FormField ────────────────────────────────────────────────────────────────

export type FormFieldState =
  | "standard"
  | "active"
  | "x"
  | "ayuda"
  | "advertencia"
  | "disabled";

export type InputType = "text" | "email" | "password" | "number" | "tel";

export interface FormFieldProps {
  label?: string;
  placeholder?: string;
  type?: InputType;
  state?: FormFieldState;
  helperText?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
}

export function FormField({
  label = "Nombre",
  placeholder = "Escribir aquí",
  type = "text",
  state = "standard",
  helperText,
  value,
  onChange,
  onClear,
}: FormFieldProps) {
  const isDisabled = state === "disabled";

  const helperMap: Partial<Record<FormFieldState, string>> = {
    ayuda: helperText ?? "Texto de ayuda",
    advertencia: helperText ?? "Campo requerido",
  };

  const resolvedHelper = helperMap[state] ?? helperText;

  return (
    <div className={`ds-form-field ds-form-field--${state}`}>
      <label className="ds-form-field__label">{label}</label>
      <div className="ds-form-field__input-wrap">
        <input
          className="ds-form-field__input"
          type={type}
          placeholder={placeholder}
          disabled={isDisabled}
          value={value}
          onChange={onChange}
          aria-invalid={state === "advertencia"}
        />
        {state === "x" && !isDisabled && (
          <motion.button
            className="ds-form-field__clear"
            onClick={onClear}
            aria-label="Limpiar"
            type="button"
            whileTap={{ scale: 0.82 }}
            transition={springs.snappy}
          >
            <Icon name="delete" size="sm" />
          </motion.button>
        )}
      </div>
      {resolvedHelper && (
        <span
          className={`ds-form-field__helper${state === "advertencia" ? " ds-form-field__helper--warn" : ""}`}
        >
          {state === "advertencia" && (
            <Icon
              name="incompleto"
              size="sm"
              className="ds-form-field__helper-icon ds-form-field__helper-icon--warn"
            />
          )}
          {resolvedHelper}
        </span>
      )}
    </div>
  );
}

// ─── OptionsExtra ────────────────────────────────────────────────────────────

export type OptionsExtraState = "add" | "remove" | "standard" | "disabled";

export interface OptionsExtraProps {
  label?: string;
  state?: OptionsExtraState;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export function OptionsExtra({
  label = "Opción",
  state = "standard",
  checked = false,
  onChange,
}: OptionsExtraProps) {
  const isDisabled = state === "disabled";

  const handleChange = () => {
    if (!isDisabled && onChange) onChange(!checked);
  };

  const isChecked = checked || state === "add" || state === "remove";
  const iconName = state === "remove" ? "remove" : "completado";

  return (
    <label className={`ds-options-extra ds-options-extra--${state}`}>
      <motion.span
        className={`ds-options-extra__box${isChecked ? " ds-options-extra__box--checked" : ""}`}
        onClick={handleChange}
        role="checkbox"
        aria-checked={checked}
        tabIndex={isDisabled ? -1 : 0}
        onKeyDown={(e) => e.key === " " && handleChange()}
        whileTap={isDisabled ? undefined : { scale: 0.85 }}
        transition={springs.snappy}
      >
        {isChecked && !isDisabled && (
          <Icon name={iconName} size="lg" color="var(--ds-color-white)" />
        )}
      </motion.span>
      <span className="ds-options-extra__label">{label}</span>
    </label>
  );
}

// ─── CheckBox ────────────────────────────────────────────────────────────────

export type CheckBoxState = "standard" | "hover" | "checked" | "disabled";

export interface CheckBoxProps {
  label?: string;
  state?: CheckBoxState;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export function CheckBox({
  label = "Opción",
  state = "standard",
  checked = false,
  onChange,
}: CheckBoxProps) {
  const isDisabled = state === "disabled";
  const isChecked = checked || state === "checked";

  const handleChange = () => {
    if (!isDisabled && onChange) onChange(!checked);
  };

  return (
    <label className={`ds-checkbox ds-checkbox--${state}${isChecked ? " ds-checkbox--checked" : ""}`}>
      <motion.span
        className="ds-checkbox__box"
        onClick={handleChange}
        role="checkbox"
        aria-checked={isChecked}
        tabIndex={isDisabled ? -1 : 0}
        onKeyDown={(e) => e.key === " " && handleChange()}
        whileTap={isDisabled ? undefined : { scale: 0.88 }}
        transition={springs.snappy}
      >
        <Icon name={isChecked ? "checkbox-fill" : "square"} size="md" />
      </motion.span>
      <span className="ds-checkbox__label">{label}</span>
    </label>
  );
}

// ─── Tag ──────────────────────────────────────────────────────────────────────

export type TagState = "active" | "standard" | "disabled";
export type TagLayout = "pill" | "label+icon" | "label";

export interface TagProps {
  label?: string;
  state?: TagState;
  layout?: TagLayout;
  icon?: IconName;
  onClick?: () => void;
}

export function Tag({ label = "Tag", state = "standard", layout = "pill", icon = "info", onClick }: TagProps) {
  const isDisabled = state === "disabled";

  return (
    <motion.button
      className={`ds-tag ds-tag--${state}${layout !== "pill" ? ` ds-tag--layout-${layout.replace("+", "-")}` : ""}`}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      type="button"
      whileTap={isDisabled ? undefined : { scale: 0.95 }}
      transition={springs.snappy}
    >
      {label}
      {layout === "label+icon" && (
        <Icon name={icon} size="md" color="currentColor" />
      )}
    </motion.button>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

export type ProgressBarStep = 0 | 25 | 50 | 75 | 100;

export interface ProgressBarProps {
  /** Progress percentage */
  progress?: number;
  /** Title label — e.g. "0% completado" */
  label?: string;
  /** Description below bar — e.g. "Faltan 4 materiales" */
  description?: string;
}

/**
 * ProgressBar — Figma vertical layout: title on top, 14px track, description below.
 */
export function ProgressBar({ progress = 0, label, description }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div className="ds-progress">
      {label && <span className="ds-progress__label">{label}</span>}
      <div className="ds-progress__track">
        <div
          className="ds-progress__fill"
          style={{ width: `${Math.max(clamped, clamped > 0 ? 4 : 0)}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {description && <span className="ds-progress__description">{description}</span>}
    </div>
  );
}

// ─── OptionLabel ─────────────────────────────────────────────────────────────

export type OptionLabelState = "active" | "standard" | "disabled";

export interface OptionLabelProps {
  label?: string;
  state?: OptionLabelState;
  onClick?: () => void;
}

export function OptionLabel({
  label = "Opción",
  state = "standard",
  onClick,
}: OptionLabelProps) {
  return (
    <motion.button
      className={`ds-option-label ds-option-label--${state}`}
      disabled={state === "disabled"}
      onClick={onClick}
      type="button"
      whileTap={state === "disabled" ? undefined : { scale: 0.97 }}
      transition={springs.snappy}
    >
      <span className="ds-option-label__dot" aria-hidden="true" />
      <span className="ds-option-label__text">{label}</span>
    </motion.button>
  );
}