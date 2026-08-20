"use strict";
/**
 * Defaults used only to seed an empty database.
 *
 * Deliberately contains NO service prices, NO add-on prices and NO surcharge
 * values. Grace supplies those in the admin portal — inventing plausible-looking
 * rates here would be worse than leaving the catalog empty, because a wrong
 * number that looks right never gets checked.
 *
 * What IS seeded: her mission statement, one crew, sensible operating hours,
 * and the scheduling constants she asked for (60-minute travel buffer).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CERT_CATEGORY_LABELS = exports.DEFAULT_SURCHARGES = exports.DEFAULT_PROPERTY_TYPES = exports.CREW_COLORS = exports.MISSION_STATEMENT = void 0;
exports.defaultCrewHours = defaultCrewHours;
exports.defaultCrew = defaultCrew;
exports.defaultSettings = defaultSettings;
exports.MISSION_STATEMENT = 'At SUNN Clean LLC, our mission is to ensure cleanliness, sanitation, ' +
    'satisfaction, and happiness for every customer we serve. We are committed ' +
    'to exceeding expectations by delivering reliable, high-quality service ' +
    'with care and integrity.';
const weekday = (start, end) => ({ enabled: true, start, end });
const closed = { enabled: false, start: 0, end: 0 };
function defaultCrewHours() {
    return {
        sun: closed,
        mon: weekday(7 * 60, 19 * 60),
        tue: weekday(7 * 60, 19 * 60),
        wed: weekday(7 * 60, 19 * 60),
        thu: weekday(7 * 60, 19 * 60),
        fri: weekday(7 * 60, 19 * 60),
        sat: weekday(8 * 60, 16 * 60),
    };
}
exports.CREW_COLORS = [
    '#3A90D6', // blue
    '#0F9E7E', // teal
    '#BC7F00', // gold
    '#A660D4', // violet
    '#D45E7A', // rose
];
function defaultCrew(index = 0) {
    return {
        name: `Crew ${String.fromCharCode(65 + index)}`,
        color: exports.CREW_COLORS[index % exports.CREW_COLORS.length],
        active: true,
        headcount: 2,
        priority: index + 1,
        hours: defaultCrewHours(),
        blackoutDates: [],
        hourlyCostPerCleaner: 0,
        notes: '',
    };
}
/**
 * Property types all start at x1.00 — i.e. switched off. Grace can raise the
 * medical or restaurant multiplier when she decides those jobs cost more.
 */
exports.DEFAULT_PROPERTY_TYPES = [
    { name: 'Office', modifier: 1, active: true, order: 1 },
    { name: 'Retail', modifier: 1, active: true, order: 2 },
    { name: 'Medical / dental', modifier: 1, active: true, order: 3 },
    { name: 'Food service / restaurant', modifier: 1, active: true, order: 4 },
    { name: 'Warehouse / industrial', modifier: 1, active: true, order: 5 },
    { name: 'Gym / fitness', modifier: 1, active: true, order: 6 },
    { name: 'Educational', modifier: 1, active: true, order: 7 },
    { name: 'Other', modifier: 1, active: true, order: 8 },
];
/**
 * Surcharges seeded INACTIVE with zero value. They appear in the admin portal
 * ready to be switched on once Grace decides what to charge.
 */
exports.DEFAULT_SURCHARGES = [
    {
        name: 'After hours', description: 'Jobs starting before or after normal hours',
        type: 'percent', value: 0, trigger: 'after_hours',
        beforeMinute: 7 * 60, afterMinute: 18 * 60, active: false, order: 1,
    },
    {
        name: 'Weekend', description: 'Saturday and Sunday jobs',
        type: 'percent', value: 0, trigger: 'weekend', active: false, order: 2,
    },
    {
        name: 'Holiday', description: 'Applied by hand on the booking',
        type: 'percent', value: 0, trigger: 'holiday', active: false, order: 3,
    },
    {
        name: 'No elevator', description: 'Multi-floor site with no elevator',
        type: 'flat', value: 0, trigger: 'no_elevator', minFloors: 2, active: false, order: 4,
    },
    {
        name: 'Travel surcharge', description: 'Outside the primary service area — add manually',
        type: 'flat', value: 0, trigger: 'manual', active: false, order: 5,
    },
];
function defaultSettings(timezone = 'America/New_York') {
    return {
        business: {
            legalName: 'SUNN Clean LLC',
            displayName: 'SUNN CLEAN',
            tagline: 'Cleaning Services',
            phone: '',
            email: '',
            addressLine1: '',
            addressLine2: '',
            timezone,
            serviceArea: '',
            serviceAreaNote: '',
            yearsInBusiness: '',
            businessesServed: '',
        },
        scheduling: {
            travelBufferMinutes: 60, // Grace's requirement
            quotingCrewHeadcount: 2,
            minLeadTimeHours: 24,
            maxHorizonDays: 60,
            minJobMinutes: 120,
            maxJobMinutes: 600,
            slotGranularityMinutes: 30,
            autoConfirmBookings: false,
            setupMinutes: 20,
        },
        invoicing: {
            taxRate: 0,
            taxLabel: 'Tax',
            paymentTermsDays: 15,
            paymentTermsLabel: 'Net 15',
            remitToInstructions: '',
            invoiceFooter: '',
            invoiceNumberPrefix: 'INV',
        },
        content: {
            missionStatement: exports.MISSION_STATEMENT,
            missionHeading: 'Our mission',
            heroHeadline: 'A workspace that shines before your team walks in.',
            heroSubhead: 'Commercial cleaning you can book online in minutes — offices, medical ' +
                'suites, retail and post-construction.',
            aboutBody: '',
            values: [
                { title: 'Cleanliness & sanitation', body: 'Every space left genuinely clean, not just tidied.' },
                { title: 'Reliability', body: 'We show up when we say we will, with the crew we promised.' },
                { title: 'Care & integrity', body: 'We treat your space like it matters, because it does.' },
            ],
        },
    };
}
exports.CERT_CATEGORY_LABELS = {
    insurance: 'Insurance & Bonding',
    safety: 'Safety & Compliance',
    industry: 'Industry Credentials',
    environmental: 'Environmental',
    personnel: 'Personnel',
};
