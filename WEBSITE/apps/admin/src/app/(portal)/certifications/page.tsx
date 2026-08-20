import {
  CERT_CATEGORY_LABELS, listCertifications, signedUrl, type CertCategory,
} from '@sunnclean/shared';
import { CertificationsEditor, type CertRow } from '@/components/CertificationsEditor';

export const dynamic = 'force-dynamic';

const CATEGORY_ORDER: CertCategory[] = [
  'insurance', 'safety', 'industry', 'environmental', 'personnel',
];

async function preview(path: string | undefined): Promise<string> {
  if (!path) return '';
  try {
    return await signedUrl(path, 60);
  } catch {
    return '';
  }
}

export default async function CertificationsPage() {
  // Unpublished credentials are included — this is where you switch them on.
  const certs = await listCertifications(false);

  const rows: CertRow[] = await Promise.all(certs.map(async (cert) => ({
    cert,
    badgeUrl: await preview(cert.badgeImagePath),
    documentUrl: await preview(cert.documentPath),
  })));

  // Both dates are computed on the server so the warning chips render the same
  // in the HTML and after hydration. This matches the comparison
  // listCertifications() itself uses to hide expired credentials publicly.
  const today = new Date().toISOString().slice(0, 10);
  const soonCutoff = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const nextOrder = certs.reduce((max, c) => Math.max(max, c.order ?? 0), 0) + 1;

  return (
    <CertificationsEditor
      rows={rows}
      categories={CATEGORY_ORDER.map((value) => ({
        value,
        label: CERT_CATEGORY_LABELS[value] ?? value,
      }))}
      today={today}
      soonCutoff={soonCutoff}
      nextOrder={nextOrder}
    />
  );
}
