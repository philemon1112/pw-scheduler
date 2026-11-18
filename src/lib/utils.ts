import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Trim a string; return null when absent or blank. */
export function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed == null || trimmed.length === 0) return null;
  return trimmed;
}

/** Two initials from a display name, for avatar fallbacks. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** `n` clamped into `[min, max]`. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** `spent / limit` as a whole percentage, guarding a zero limit. */
export function percentOf(part: number, whole: number): number {
  if (!Number.isFinite(whole) || whole <= 0) return 0;
  return clamp(Math.round((part / whole) * 100), 0, 999);
}
