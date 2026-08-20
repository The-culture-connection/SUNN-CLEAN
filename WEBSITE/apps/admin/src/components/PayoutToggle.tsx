'use client';
import { Toggle, useAction } from './ui';

export function PayoutToggle({ bookingIds, paid, label }: {
  bookingIds: string[]; paid: boolean; label: string;
}) {
  const { run, pending } = useAction();
  return (
    <span style={{ opacity: pending ? 0.5 : 1 }}>
      <Toggle on={paid} label={label}
        onChange={(v) => run('/api/payouts', { bookingIds, paid: v })} />
    </span>
  );
}
