/**
 * SUNN CLEAN — shared domain types.
 *
 * Design rule that matters: NOTHING about pricing or job duration is hardcoded.
 * Every rate, minimum, production rate and surcharge lives in Firestore and is
 * edited by Grace in the admin portal. This file only describes the shape.
 */

export type ISODate = string; // "2026-09-14" in business-local time
export type Millis = number;

/* ------------------------------------------------------------------ */
/* Catalog — services and add-ons are one collection, two kinds        */
/* ------------------------------------------------------------------ */

export type CatalogKind = 'service' | 'addon';

export interface CatalogItem {
  id: string;
  kind: CatalogKind;
  name: string;
  description: string;
  active: boolean;
  order: number;

  /** kind === 'service' ------------------------------------------- */
  /** Price per square foot, e.g. 0.12 */
  ratePerSqFt?: number;
  /** Floor applied AFTER modifiers (see pricing.ts) */
  minimumCharge?: number;
  /** Square feet one cleaner covers per hour. Drives job duration. */
  productionRateSqFtPerCleanerHour?: number;

  /** kind === 'addon' --------------------------------------------- */
  /** Flat price for one unit of this add-on */
  price?: number;
  /** Shown to the customer, e.g. "per restroom" */
  unitLabel?: string;
  /** Extra on-site minutes per unit */
  minutesPerUnit?: number;
  /** If false the add-on is a simple yes/no with quantity fixed at 1 */
  allowQuantity?: boolean;

  createdAt?: Millis;
  updatedAt?: Millis;
}

/* ------------------------------------------------------------------ */
/* Property types & surcharges                                         */
/* ------------------------------------------------------------------ */

export interface PropertyType {
  id: string;
  name: string;
  /** Multiplier on the base service price. 1.0 = no change. */
  modifier: number;
  active: boolean;
  order: number;
}

export type SurchargeTrigger =
  | 'after_hours'
  | 'weekend'
  | 'holiday'
  | 'no_elevator'
  | 'manual';

export interface Surcharge {
  id: string;
  name: string;
  description: string;
  /** 'percent' → value is a fraction (0.15 = +15%). 'flat' → value is dollars. */
  type: 'percent' | 'flat';
  value: number;
  trigger: SurchargeTrigger;
  /** after_hours only: minutes from local midnight */
  beforeMinute?: number;
  afterMinute?: number;
  /** no_elevator only: minimum floor count to trigger */
  minFloors?: number;
  active: boolean;
  order: number;
}

/* ------------------------------------------------------------------ */
/* Crews — operating hours live here, per crew                         */
/* ------------------------------------------------------------------ */

/**
 * Minutes from local midnight. `end` may exceed 1440 for an overnight shift:
 * 22:00–02:00 is { start: 1320, end: 1560 }. A "HH:MM" string cannot express
 * that, which is why this is stored as numbers.
 */
export interface DayHours {
  enabled: boolean;
  start: number;
  end: number;
}

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

export interface Crew {
  id: string;
  name: string;
  color: string;
  active: boolean;
  /** Number of cleaners. Drives payout, and the quoting headcount fallback. */
  headcount: number;
  /** Lower runs first when auto-assigning. */
  priority: number;
  hours: Record<Weekday, DayHours>;
  /** ISO dates this crew is unavailable */
  blackoutDates: ISODate[];
  /** Payout tracking only — the app never pays anyone */
  hourlyCostPerCleaner: number;
  notes: string;
  createdAt?: Millis;
  updatedAt?: Millis;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface SchedulingSettings {
  travelBufferMinutes: number;
  /** Headcount used to quote duration. Set to your smallest crew. */
  quotingCrewHeadcount: number;
  minLeadTimeHours: number;
  maxHorizonDays: number;
  minJobMinutes: number;
  maxJobMinutes: number;
  slotGranularityMinutes: number;
  autoConfirmBookings: boolean;
  /** Fixed minutes added to every job for load-in / walkthrough / load-out */
  setupMinutes: number;
}

export interface InvoicingSettings {
  taxRate: number;          // 0.08875 = 8.875%
  taxLabel: string;
  paymentTermsDays: number;
  paymentTermsLabel: string;
  remitToInstructions: string;
  invoiceFooter: string;
  invoiceNumberPrefix: string;
}

export interface BusinessSettings {
  legalName: string;
  displayName: string;
  tagline: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  timezone: string;
  serviceArea: string;
  serviceAreaNote: string;
  yearsInBusiness: string;
  businessesServed: string;
}

export interface ContentSettings {
  missionStatement: string;
  missionHeading: string;
  heroHeadline: string;
  heroSubhead: string;
  aboutBody: string;
  values: { title: string; body: string }[];
}

export interface Settings {
  business: BusinessSettings;
  scheduling: SchedulingSettings;
  invoicing: InvoicingSettings;
  content: ContentSettings;
  updatedAt?: Millis;
}

export interface Blackout {
  id: string;
  date: ISODate;
  label: string;
}

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

export type BookingStatus =
  | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type LineItemType =
  | 'base' | 'modifier' | 'addon' | 'surcharge' | 'discount' | 'adjustment';

export interface LineItem {
  key: string;
  label: string;
  type: LineItemType;
  quantity?: number;
  unitPrice?: number;
  multiplier?: number;
  /** Dollar effect on the subtotal. Modifier rows carry 0 and are display-only. */
  amount: number;
  note?: string;
  byUid?: string;
  at?: Millis;
}

export interface PricingBlock {
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  finalTotal: number;
  /** Frozen at booking time. Never recomputed. */
  estimateTotal: number;
  currency: 'USD';
  /** The catalog + settings actually used, frozen so history is reproducible */
  rateSnapshot: {
    serviceName: string;
    ratePerSqFt: number;
    minimumCharge: number;
    productionRate: number;
    propertyTypeName: string;
    propertyModifier: number;
    quotingHeadcount: number;
    setupMinutes: number;
    taxRate: number;
  };
}

export interface Booking {
  id: string;
  bookingNumber: string;
  status: BookingStatus;

  customer: {
    businessName: string;
    contactName: string;
    email: string;
    phone: string;
    preferredContact: 'email' | 'phone';
  };

  site: {
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    /** Alarm codes etc. Crew-only. Never rendered publicly or exported. */
    accessNotes: string;
    parkingNotes: string;
  };

  property: {
    propertyTypeId: string;
    propertyTypeName: string;
    squareFeet: number;
    floors: number;
    hasElevator: boolean;
  };

  service: {
    serviceId: string;
    serviceName: string;
    customerNotes: string;
    /** Customer expressed interest in recurring; priced at one-time rate. */
    recurringInterest: boolean;
    recurringFrequencyLabel: string;
  };

  addOns: { id: string; name: string; quantity: number; unitPrice: number; total: number }[];

  schedule: {
    /** UTC millis */
    serviceStart: Millis;
    serviceEnd: Millis;
    estimatedDurationMinutes: number;
    travelBufferMinutes: number;
    crewId: string;
    crewName: string;
    quotingHeadcountAtBooking: number;
    timezone: string;
    /** Business-local calendar dates the service window touches */
    dates: ISODate[];
  };

  pricing: PricingBlock;

  completion: {
    markedCompleteAt?: Millis;
    markedCompleteBy?: string;
    actualStart?: Millis;
    actualEnd?: Millis;
    actualLaborHours?: number;
    crewNotes?: string;
    photoPaths?: string[];
  };

  invoiceId?: string;
  reviewId?: string;

  payout: {
    computedAmount: number;
    overrideAmount?: number;
    overrideNote?: string;
    paid: boolean;
    paidAt?: Millis;
  };

  requests: {
    cancellationRequested: boolean;
    rescheduleRequested: boolean;
    requestNote: string;
    requestedAt?: Millis;
  };

  meta: {
    lookupTokenHash: string;
    reviewTokenHash?: string;
    createdAt: Millis;
    updatedAt: Millis;
    source: 'web' | 'admin' | 'phone';
    createdByUid?: string;
  };
}

/* ------------------------------------------------------------------ */
/* Scheduling index — the authoritative occupancy record               */
/* ------------------------------------------------------------------ */

export interface CrewDayBlock {
  bookingId: string;
  /** UTC millis of the SERVICE window. Buffers are applied at compare time. */
  start: Millis;
  end: Millis;
  label: string;
}

export interface CrewDay {
  id: string;            // `${crewId}_${YYYY-MM-DD}`
  crewId: string;
  date: ISODate;
  blocks: CrewDayBlock[];
  updatedAt: Millis;
}

/* ------------------------------------------------------------------ */
/* Invoices, reviews, gallery, certifications, notifications           */
/* ------------------------------------------------------------------ */

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  customerEmail: string;
  status: InvoiceStatus;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  amount: number;
  issuedAt: Millis;
  sentAt?: Millis;
  sentByUid?: string;
  dueDate?: Millis;
  termsLabel: string;
  paidAt?: Millis;
  paidAmount?: number;
  paymentMethod?: 'check' | 'ach' | 'cash' | 'card_offline' | 'other';
  paymentReference?: string;
  notes?: string;
  createdAt: Millis;
  updatedAt: Millis;
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  id: string;
  bookingId?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  displayName: string;
  displayNameMode: 'business' | 'first_name' | 'anonymous';
  businessTypeLabel: string;
  serviceId: string;
  serviceName: string;
  /** Not published. Used to auto-verify against completed bookings. */
  email: string;
  verified: boolean;
  photoPaths: string[];
  status: ReviewStatus;
  featured: boolean;
  ownerResponse?: { body: string; at: Millis; byUid: string };
  moderation?: { byUid: string; at: Millis; reason: string };
  ipHash: string;
  submittedAt: Millis;
}

export interface GalleryPair {
  id: string;
  beforePath: string;
  afterPath: string;
  caption: string;
  serviceId: string;
  serviceName: string;
  jobLengthLabel: string;
  sourceBookingId?: string;
  consentConfirmed: boolean;
  consentConfirmedBy: string;
  published: boolean;
  featured: boolean;
  order: number;
  createdAt: Millis;
  updatedAt: Millis;
}

export type CertCategory =
  | 'insurance' | 'safety' | 'industry' | 'environmental' | 'personnel';

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  category: CertCategory;
  credentialId: string;
  description: string;
  issueDate?: ISODate;
  expiryDate?: ISODate;
  badgeImagePath?: string;
  documentPath?: string;
  published: boolean;
  order: number;
  createdAt: Millis;
  updatedAt: Millis;
}

export type NotificationType =
  | 'new_booking' | 'job_needs_completion' | 'invoice_needed' | 'invoice_overdue'
  | 'reschedule_requested' | 'cancellation_requested' | 'review_pending'
  | 'certification_expiring' | 'contact_form' | 'recurring_lead';

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: 'info' | 'action' | 'warning';
  title: string;
  body: string;
  link: string;
  relatedId?: string;
  read: boolean;
  readByUid?: string;
  readAt?: Millis;
  createdAt: Millis;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  handled: boolean;
  createdAt: Millis;
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  byUid: string;
  byEmail: string;
  detail: string;
  createdAt: Millis;
}

/* ------------------------------------------------------------------ */
/* API payloads                                                        */
/* ------------------------------------------------------------------ */

export interface QuoteRequest {
  serviceId: string;
  propertyTypeId: string;
  squareFeet: number;
  floors: number;
  hasElevator: boolean;
  addOns: { id: string; quantity: number }[];
  /** UTC millis; only needed for time-dependent surcharges */
  startAt?: Millis;
}

export interface QuoteResult {
  ok: boolean;
  reason?: 'requires_manual_quote' | 'invalid_service' | 'invalid_input';
  durationMinutes: number;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  rateSnapshot: PricingBlock['rateSnapshot'];
}

export interface AvailabilitySlot {
  /** UTC millis */
  start: Millis;
  end: Millis;
  /** "08:00" business-local, for display */
  startLabel: string;
  endLabel: string;
}

export interface AvailabilityResult {
  date: ISODate;
  timezone: string;
  durationMinutes: number;
  slots: AvailabilitySlot[];
  reason?: 'requires_manual_quote' | 'blackout' | 'closed' | 'out_of_range' | 'no_crews';
}
