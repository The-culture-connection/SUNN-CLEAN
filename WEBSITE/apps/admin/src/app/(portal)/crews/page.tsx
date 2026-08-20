import {
  CREW_COLORS, WEEKDAYS, WEEKDAY_LABELS, defaultCrew, listCrews, type Crew,
} from '@sunnclean/shared';
import { CrewEditor } from '@/components/CrewEditor';

export const dynamic = 'force-dynamic';

/** The next colour nobody is using yet, so two crews never look alike. */
function nextColor(crews: Crew[]): string {
  const taken = new Set(crews.map((c) => (c.color ?? '').toLowerCase()));
  return CREW_COLORS.find((c) => !taken.has(c.toLowerCase()))
    ?? CREW_COLORS[crews.length % CREW_COLORS.length];
}

export default async function CrewsPage() {
  // Inactive crews are included on purpose — this is where you switch them back on.
  const crews = await listCrews(false);

  // Constants and defaults are resolved here rather than in the client component,
  // because the shared package reaches into firebase-admin at import time.
  return (
    <CrewEditor
      crews={crews}
      days={WEEKDAYS.map((key) => ({ key, label: WEEKDAY_LABELS[key] }))}
      newCrew={{ ...defaultCrew(crews.length), color: nextColor(crews) }}
    />
  );
}
