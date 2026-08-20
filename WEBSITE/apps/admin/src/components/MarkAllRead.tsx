'use client';
import { useAction } from './ui';

export function MarkAllRead() {
  const { run, pending } = useAction();
  return (
    <button className="btn btn-ghost btn-sm" disabled={pending}
      onClick={() => run('/api/notifications', { action: 'read_all' })}>
      {pending ? 'Marking…' : 'Mark all read'}
    </button>
  );
}
