import { getSettings } from '@sunnclean/shared';
import { SettingsEditor } from '@/components/SettingsEditor';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // getSettings() merges over the defaults, so a document written before a field
  // existed still arrives complete and the editor never sees an undefined.
  const settings = await getSettings();
  return <SettingsEditor settings={settings} />;
}
