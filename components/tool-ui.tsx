"use client";

import { Check, Clipboard, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";

export function ActionButton({ children, onClick, icon, variant = "secondary", disabled = false, type = "button" }: { children: ReactNode; onClick?: () => void; icon?: ReactNode; variant?: "primary" | "secondary" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  return <button type={type} className={`button button-${variant}`} onClick={onClick} disabled={disabled}>{icon}{children}</button>;
}

export function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="icon-button" aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return <ActionButton onClick={copy} disabled={!value} icon={copied ? <Check size={16} /> : <Clipboard size={16} />}>{copied ? "Copied" : label}</ActionButton>;
}

export function ClearButton({ onClick }: { onClick: () => void }) {
  return <ActionButton onClick={onClick} icon={<Trash2 size={16} />} variant="secondary">Clear</ActionButton>;
}

export function SegmentedControl<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; label: string }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map((option) => <button type="button" key={option.value} className={value === option.value ? "active" : ""} onClick={() => onChange(option.value)} aria-pressed={value === option.value}>{option.label}</button>)}</div>;
}

export function Status({ type, children }: { type: "error" | "success" | "info"; children: ReactNode }) {
  return <div className={`status status-${type}`} role={type === "error" ? "alert" : "status"}>{children}</div>;
}
