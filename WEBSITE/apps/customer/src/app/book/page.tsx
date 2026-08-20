import { loadPublicData } from '@/lib/data';
import { BookingWizard } from '@/components/BookingWizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Book a Cleaning' };

export default async function BookPage() {
  const { settings, services, addOns, propertyTypes } = await loadPublicData();
  return (
    <section>
      <div className="wrap">
        <div className="sechead" style={{ marginBottom: 30 }}>
          <p className="eyebrow">Book online</p>
          <h1 style={{ marginTop: 10 }}>Get your price and pick a time</h1>
        </div>
        <BookingWizard settings={settings} services={services}
          addOns={addOns} propertyTypes={propertyTypes} />
      </div>
    </section>
  );
}
