import { listCatalog } from '@sunnclean/shared';
import { CatalogEditor } from '@/components/CatalogEditor';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  // Hidden items are included — this page is where you bring them back.
  const items = await listCatalog({});
  return (
    <CatalogEditor
      services={items.filter((i) => i.kind === 'service')}
      addOns={items.filter((i) => i.kind === 'addon')}
    />
  );
}
