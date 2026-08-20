import { listPropertyTypes, listSurcharges } from '@sunnclean/shared';
import { PricingEditor } from '@/components/PricingEditor';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  // Inactive rows are included — switching them on is the whole point of this page.
  const [surcharges, propertyTypes] = await Promise.all([
    listSurcharges(false),
    listPropertyTypes(false),
  ]);
  return <PricingEditor surcharges={surcharges} propertyTypes={propertyTypes} />;
}
