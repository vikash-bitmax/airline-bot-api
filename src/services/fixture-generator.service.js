import crypto from 'crypto';

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
    generatedAt: new Date(),
  };
};

export default {
  generateCustomerFixture,
};
