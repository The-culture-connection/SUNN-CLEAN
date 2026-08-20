export function money(n: number): string {
  return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
export function durationLabel(mins: number): string {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
