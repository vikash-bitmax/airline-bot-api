import crypto from 'crypto';
import Customer from '../models/Customer.model.js';

/**
 * Pseudo-random number generator using Mulberry32 algorithm
 * Seeded with hash of (randomSeed + conversationId) for deterministic output
 */
const createPrng = (seedStr) => {
  const hash = crypto.createHash('sha256').update(seedStr).digest();
  let a = hash.readUInt32LE(0);
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const FIRST_NAMES = ['Alexander', 'Sarah', 'Kunal', 'Elena', 'Marcus', 'Priya', 'David', 'Fatima', 'Liam', 'Sophie'];
const LAST_NAMES = ['Smith', 'Jenkins', 'Rajput', 'Vasiliev', 'Chen', 'Patel', 'Miller', 'Al-Mansoor', 'O\'Connor', 'Dubois'];
const ROUTES = [
  { origin: 'LHR', destination: 'JFK', flight: 'SK101' },
  { origin: 'DEL', destination: 'DXB', flight: 'SK420' },
  { origin: 'CDG', destination: 'ORD', flight: 'SK712' },
  { origin: 'SIN', destination: 'SYD', flight: 'SK305' },
  { origin: 'BOM', destination: 'LHR', flight: 'SK882' },
];

export const generateCustomerFixture = ({ randomSeed, conversationId, scenarioRequirements = [] }) => {
  const combinedSeed = `${randomSeed || 'default-seed'}:${conversationId}`;
  const rand = createPrng(combinedSeed);

  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const randomChars = (chars, len) => {
    let res = '';
    for (let i = 0; i < len; i++) {
      res += chars[Math.floor(rand() * chars.length)];
    }
    return res;
  };

  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const passengerName = `${firstName} ${lastName}`;
  const passengerEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}@example.test`;
  const passengerPhone = `+1-555-${String(Math.floor(rand() * 9000 + 1000))}`;
  const pnr = randomChars('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
  const selectedRoute = pick(ROUTES);
  const flightNumber = selectedRoute.flight;
  const route = `${selectedRoute.origin} -> ${selectedRoute.destination}`;
  const baggageTag = `BAG-${randomChars('0123456789', 6)}`;
  const paymentReference = `TXN-${randomChars('0123456789ABCDEF', 10)}`;

  // Deterministic travel date (between 1 and 14 days in future)
  const daysOffset = Math.floor(rand() * 14) + 1;
  const travelDate = new Date(Date.now() + daysOffset * 86400000).toISOString().split('T')[0];

  const facts = {
    passengerName,
    passengerEmail,
    passengerPhone,
    pnr,
    flightNumber,
    route,
    origin: selectedRoute.origin,
    destination: selectedRoute.destination,
    travelDate,
    baggageTag,
    paymentReference,
    bookingStatus: 'CONFIRMED',
    fareClass: 'ECONOMY_STANDARD',
    ticketAmount: '$450.00',
  };

  // Disclosure policies mapped per requirement
  const disclosurePolicies = {
    passengerName: 'initial',
    route: 'initial',
    flightNumber: 'initial',
    pnr: 'on_request',
    passengerEmail: 'on_request',
    passengerPhone: 'on_request',
    travelDate: 'on_request',
    baggageTag: 'on_request',
    paymentReference: 'on_request',
    ticketAmount: 'on_request',
    bookingStatus: 'after_verification',
    fareClass: 'after_verification',
    internalNote: 'internal_only',
  };

  return {
    facts,
    disclosurePolicies,
    seed: combinedSeed,
    source: 'SYNTHETIC_ALGORITHMIC',
    generatedAt: new Date(),
  };
};

/**
 * Fetches a random customer record from the seeded MongoDB `customers` collection.
 * Uses real synthetic dataset fields (Name, PNR, Flight, Itinerary, Seat, Baggage, etc.)
 * Falls back to algorithmic generator if database is unavailable or empty.
 */
export const generateCustomerFixtureFromDb = async ({
  randomSeed,
  conversationId,
  scenarioRequirements = [],
  filter = {},
} = {}) => {
  try {
    if (Customer.db && Customer.db.readyState === 1) {
      const matchStage = filter && Object.keys(filter).length > 0 ? { $match: filter } : { $match: {} };
      const results = await Customer.aggregate([matchStage, { $sample: { size: 1 } }]);

      if (results && results.length > 0) {
        const c = results[0];
        const outbound = c.itinerary?.outbound || {};
        const booking = c.booking || {};
        const cust = c.customer || {};
        const ancillaries = c.ancillaries || {};
        const support = c.support_context || {};

        const firstName = cust.first_name || 'Passenger';
        const lastName = cust.last_name || 'Customer';
        const passengerName = cust.full_name || `${firstName} ${lastName}`;
        const passengerEmail = cust.email || `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}@example.test`;
        const passengerPhone = cust.phone || '+1-555-0199';
        const pnr = booking.pnr || 'SW999999';
        const flightNumber = outbound.flight_number || 'SW101';
        const origin = outbound.origin_airport || 'DEL';
        const destination = outbound.destination_airport || 'BOM';
        const route = `${origin} -> ${destination}`;
        const travelDate = outbound.departure_date || new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];
        const baggageTag = booking.booking_id ? `BAG-${booking.booking_id.slice(-6)}` : `BAG-${Math.floor(100000 + Math.random() * 900000)}`;
        const paymentReference = booking.booking_id || `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

        const facts = {
          passengerName,
          passengerEmail,
          passengerPhone,
          pnr,
          flightNumber,
          route,
          origin,
          destination,
          originCity: outbound.origin_city,
          destinationCity: outbound.destination_city,
          travelDate,
          baggageTag,
          paymentReference,
          bookingStatus: booking.booking_status || 'CONFIRMED',
          fareClass: booking.cabin_class || 'ECONOMY_STANDARD',
          ticketAmount: booking.total_fare_inr ? `₹${booking.total_fare_inr}` : '$450.00',
          seat: outbound.seat || '12B',
          specialAssistance: ancillaries.special_assistance || 'None',
          mealPreference: ancillaries.meal_preference || 'Standard',
          checkedBaggageKg: ancillaries.checked_baggage_allowance_kg || 15,
          loyaltyTier: c.loyalty?.tier || 'Standard',
          loyaltyPoints: c.loyalty?.points_balance || 0,
          primaryIssue: support.primary_issue || '',
          issueDescription: support.issue_description || '',
          customerSentiment: support.customer_sentiment || 'Neutral',
          caseId: support.case_id || '',
          recordId: c.record_id,
        };

        const disclosurePolicies = {
          passengerName: 'initial',
          route: 'initial',
          flightNumber: 'initial',
          pnr: 'on_request',
          passengerEmail: 'on_request',
          passengerPhone: 'on_request',
          travelDate: 'on_request',
          baggageTag: 'on_request',
          paymentReference: 'on_request',
          ticketAmount: 'on_request',
          bookingStatus: 'after_verification',
          fareClass: 'after_verification',
          seat: 'on_request',
          internalNote: 'internal_only',
        };

        return {
          facts,
          disclosurePolicies,
          seed: `${c.record_id}:${conversationId || 'default'}`,
          source: 'DATABASE_CUSTOMER',
          dbCustomer: c,
          generatedAt: new Date(),
        };
      }
    }
  } catch (err) {
    // Graceful fallback to algorithmic fixture
  }

  return generateCustomerFixture({ randomSeed, conversationId, scenarioRequirements });
};

export default {
  generateCustomerFixture,
  generateCustomerFixtureFromDb,
};
