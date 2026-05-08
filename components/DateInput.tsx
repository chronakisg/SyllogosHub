"use client";

import { useEffect, useState } from "react";

type Props = {
  value: string;
  onChange: (isoValue: string) => void;
  className?: string;
  required?: boolean;
  id?: string;
};

const ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DISPLAY_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isoToDisplay(iso: string): string {
  if (!iso || !ISO_REGEX.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string | null {
  const match = display.match(DISPLAY_REGEX);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10);
  const year = parseInt(yyyy, 10);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  // Validate by constructing a Date
  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  const isoMonth = String(month).padStart(2, "0");
  const isoDay = String(day).padStart(2, "0");
  return `${year}-${isoMonth}-${isoDay}`;
}

function autoFormat(input: string, prev: string): string {
  // Strip everything except digits and slashes
  const cleaned = input.replace(/[^\d/]/g, "");
  // If user just typed and we are growing, auto-insert slashes after positions 2 and 5
  if (cleaned.length > prev.length) {
    const digitsOnly = cleaned.replace(/\//g, "");
    let formatted = digitsOnly;
    if (digitsOnly.length >= 3 && digitsOnly.length <= 4) {
      formatted = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
    } else if (digitsOnly.length >= 5) {
      formatted = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(4, 8)}`;
    }
    return formatted;
  }
  return cleaned;
}

export function DateInput({ value, onChange, className, required, id }: Props) {
  const [display, setDisplay] = useState<string>(isoToDisplay(value));
  const [error, setError] = useState<boolean>(false);

  // Sync external value changes
  useEffect(() => {
    setDisplay(isoToDisplay(value));
    setError(false);
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = autoFormat(e.target.value, display);
    setDisplay(next);

    if (next === "") {
      setError(false);
      onChange("");
      return;
    }

    const iso = displayToIso(next);
    if (iso) {
      setError(false);
      onChange(iso);
    } else {
      // Don't call onChange with invalid value; mark error only when length is "complete"
      setError(next.length >= 10);
    }
  }

  function handleBlur() {
    if (display === "") {
      setError(false);
      return;
    }
    const iso = displayToIso(display);
    if (!iso) {
      setError(true);
    } else {
      setError(false);
    }
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="ΗΗ/ΜΜ/ΕΕΕΕ"
      maxLength={10}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      required={required}
      className={`${className ?? ""} ${error ? "border-red-500" : ""}`}
      aria-invalid={error}
    />
  );
}
