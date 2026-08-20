/**
 * Formatting helpers.
 *
 * These deliberately live OUTSIDE components/ui.tsx. That file carries a
 * 'use client' directive, which turns every one of its exports into a client
 * reference — calling one from a server component throws
 * "(0 , o.CZ) is not a function" at runtime, with no compile-time warning.
 * Plain helpers used on both sides belong in a plain module.
 */

export function money(n: number): string {
  return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function durationLabel(mins: number): string {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
