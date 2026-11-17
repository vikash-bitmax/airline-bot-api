import mongoose from 'mongoose';
import { env } from '../src/config/environment.js';
import Scenario from '../src/models/Scenario.model.js';
import logger from '../src/utils/logger.js';

export const scenariosData = [
  {
    scenarioId: 'S001',
    name: 'Flight Cancellation',
    category: 'disruption',
    description: 'Passenger receives notice of flight cancellation and contacts support to rebook or request a full refund.',
    initialState: 'INTRODUCE_ISSUE',
    terminalStates: ['COMPLETED', 'ESCALATED', 'ABANDONED'],
    customerObjective: 'Obtain a free alternative flight or a full refund back to original payment method.',
    maxTurns: 20,
    requiredFacts: [
      {
        key: 'pnr',
        label: 'Passenger PNR',
        generator: 'synthetic_pnr',
        required: true,
        disclosurePolicy: 'on_request',
      },
      {
        key: 'passengerName',
        label: 'Passenger Name',
        generator: 'synthetic_name',
        required: true,
        disclosurePolicy: 'initial',
      },
      {
        key: 'flightNumber',
        label: 'Flight Number',
        generator: 'synthetic_flight',
        required: true,
        disclosurePolicy: 'on_request',
      },
      {
        key: 'travelDate',
        label: 'Travel Date',
        generator: 'synthetic_date',
        required: true,
        disclosurePolicy: 'on_request',
      },
      {
        key: 'route',
        label: 'Flight Route',
        generator: 'synthetic_route',
        required: true,
        disclosurePolicy: 'initial',
      },
    ],
    stateMachine: {
      INTRODUCE_ISSUE: {
        description: 'Customer states that their flight was cancelled and needs assistance.',
        allowedFacts: ['passengerName', 'route'],
        transitions: [
          { event: 'AGENT_ASKED_FOR_PNR', targetState: 'PROVIDE_BOOKING_DETAILS' },
          { event: 'AGENT_ACKNOWLEDGED', targetState: 'PROVIDE_BOOKING_DETAILS' },
          { event: 'CLARIFICATION_PROVIDED', targetState: 'PROVIDE_BOOKING_DETAILS' },
        ],
      },
      PROVIDE_BOOKING_DETAILS: {
        description: 'Customer provides booking reference (PNR) and flight details.',
        allowedFacts: ['pnr', 'flightNumber', 'travelDate'],
        transitions: [
          { event: 'BOOKING_IDENTIFIED', targetState: 'DISCUSS_OPTIONS' },
          { event: 'CLARIFICATION_PROVIDED', targetState: 'DISCUSS_OPTIONS' },
        ],
      },
      DISCUSS_OPTIONS: {
        description: 'Agent offers alternative flight or refund options.',
        allowedFacts: ['pnr'],
        transitions: [
          { event: 'ALTERNATIVE_FLIGHT_OFFERED', targetState: 'WAIT_FOR_CUSTOMER' },
          { event: 'REFUND_OPTIONS_EXPLAINED', targetState: 'WAIT_FOR_CUSTOMER' },
          { event: 'CHAT_ESCALATED', targetState: 'ESCALATED' },
        ],
      },
      WAIT_FOR_CUSTOMER: {
        description: 'Customer selects option (rebook or refund) and confirms agreement.',
        allowedFacts: [],
        transitions: [
          { event: 'CUSTOMER_CONFIRMED_OPTION', targetState: 'COMPLETED' },
          { event: 'REFUND_PROCESSED', targetState: 'COMPLETED' },
          { event: 'REBOOKING_COMPLETED', targetState: 'COMPLETED' },
          { event: 'CHAT_CLOSED', targetState: 'COMPLETED' },
        ],
      },
      COMPLETED: {
        description: 'Issue resolved successfully.',
        allowedFacts: [],
        transitions: [],
      },
      ESCALATED: {
        description: 'Transferred to supervisor or L2 queue.',
        allowedFacts: [],
        transitions: [
          { event: 'CHAT_CLOSED', targetState: 'COMPLETED' },
        ],
      },
      ABANDONED: {
        description: 'Customer ceased replying.',
        allowedFacts: [],
        transitions: [],
      },
    },
    successCriteria: [
      {
        criterionId: 'SC01',
        description: 'Booking was identified using synthetic PNR',
        eventType: 'BOOKING_IDENTIFIED',
        required: true,
        evidenceSource: 'CRM_EVENT',
      },
      {
        criterionId: 'SC02',
        description: 'Alternative rebooking or refund was resolved',
        eventType: 'COMPLETED',
        required: true,
        evidenceSource: 'SEMANTIC_EVENT',
      },
    ],
  },

  {
    scenarioId: 'S002',
    name: 'Flight Delay',
    category: 'disruption',
    description: 'Flight is delayed by 4 hours; customer asks for updated departure, meal vouchers, and connection protection.',
    initialState: 'INTRODUCE_ISSUE',
    terminalStates: ['COMPLETED', 'ESCALATED', 'ABANDONED'],
    customerObjective: 'Receive verified new departure time and meal voucher entitlement.',
    maxTurns: 15,
    requiredFacts: [
      { key: 'pnr', label: 'PNR', generator: 'synthetic_pnr', required: true, disclosurePolicy: 'on_request' },
      { key: 'passengerName', label: 'Passenger Name', generator: 'synthetic_name', required: true, disclosurePolicy: 'initial' },
      { key: 'flightNumber', label: 'Flight Number', generator: 'synthetic_flight', required: true, disclosurePolicy: 'initial' },
    ],
    stateMachine: {
      INTRODUCE_ISSUE: {
        description: 'Customer mentions delayed flight.',
        allowedFacts: ['passengerName', 'flightNumber'],
        transitions: [
          { event: 'AGENT_ASKED_FOR_PNR', targetState: 'PROVIDE_BOOKING_DETAILS' },
          { event: 'AGENT_ACKNOWLEDGED', targetState: 'PROVIDE_BOOKING_DETAILS' },
          { event: 'CLARIFICATION_PROVIDED', targetState: 'PROVIDE_BOOKING_DETAILS' },
        ],
      },
      PROVIDE_BOOKING_DETAILS: {
        description: 'Customer shares PNR.',
        allowedFacts: ['pnr'],
        transitions: [{ event: 'BOOKING_IDENTIFIED', targetState: 'CHECK_DELAY_STATUS' }],
      },
      CHECK_DELAY_STATUS: {
        description: 'Agent checks delay reasons and explains new timing.',
        allowedFacts: [],
        transitions: [{ event: 'DELAY_STATUS_PROVIDED', targetState: 'OFFER_AMENITIES' }],
      },
      OFFER_AMENITIES: {
        description: 'Agent provides meal voucher or lounge access.',
        allowedFacts: [],
        transitions: [
          { event: 'AMENITY_VOUCHER_ISSUED', targetState: 'COMPLETED' },
          { event: 'CHAT_CLOSED', targetState: 'COMPLETED' },
        ],
      },
      COMPLETED: { description: 'Resolved', allowedFacts: [], transitions: [] },
      ESCALATED: { description: 'Escalated', allowedFacts: [], transitions: [] },
      ABANDONED: { description: 'Abandoned', allowedFacts: [], transitions: [] },
    },
    successCriteria: [
      { criterionId: 'SC01', description: 'Delay status verified', eventType: 'DELAY_STATUS_PROVIDED', required: true },
    ],
  },

  {
    scenarioId: 'S003',
    name: 'Refund Request',
    category: 'billing',
    description: 'Passenger requests refund for unused ticket following medical emergency.',
    initialState: 'INTRODUCE_ISSUE',
    terminalStates: ['COMPLETED', 'ESCALATED', 'ABANDONED'],
    customerObjective: 'Submit refund request and receive refund petition tracking number.',
    maxTurns: 18,
    requiredFacts: [
      { key: 'pnr', label: 'PNR', generator: 'synthetic_pnr', required: true, disclosurePolicy: 'on_request' },
      { key: 'passengerName', label: 'Passenger Name', generator: 'synthetic_name', required: true, disclosurePolicy: 'initial' },
      { key: 'passengerEmail', label: 'Email', generator: 'synthetic_email', required: true, disclosurePolicy: 'on_request' },
    ],
    stateMachine: {
      INTRODUCE_ISSUE: {
        description: 'Customer states refund request.',
        allowedFacts: ['passengerName'],
        transitions: [{ event: 'AGENT_ASKED_FOR_PNR', targetState: 'PROVIDE_BOOKING_DETAILS' }],
      },
      PROVIDE_BOOKING_DETAILS: {
        description: 'Customer provides PNR and email.',
        allowedFacts: ['pnr', 'passengerEmail'],
        transitions: [{ event: 'BOOKING_IDENTIFIED', targetState: 'VALIDATE_REFUND_ELIGIBILITY' }],
      },
      VALIDATE_REFUND_ELIGIBILITY: {
        description: 'Agent reviews fare rules and policy.',
        allowedFacts: [],
        transitions: [{ event: 'REFUND_OPTIONS_EXPLAINED', targetState: 'PROCESS_REFUND' }],
      },
      PROCESS_REFUND: {
        description: 'Agent files petition and provides reference.',
        allowedFacts: [],
        transitions: [
          { event: 'REFUND_PROCESSED', targetState: 'COMPLETED' },
          { event: 'PETITION_CREATED', targetState: 'COMPLETED' },
        ],
      },
      COMPLETED: { description: 'Refund registered', allowedFacts: [], transitions: [] },
      ESCALATED: { description: 'Escalated', allowedFacts: [], transitions: [] },
      ABANDONED: { description: 'Abandoned', allowedFacts: [], transitions: [] },
    },
    successCriteria: [
      { criterionId: 'SC01', description: 'Refund eligibility confirmed', eventType: 'REFUND_OPTIONS_EXPLAINED', required: true },
    ],
  },

  {
    scenarioId: 'S004',
    name: 'Lost or Delayed Baggage',
    category: 'baggage',
    description: 'Checked baggage failed to arrive on carousel; passenger holds baggage claim tag.',
    initialState: 'INTRODUCE_ISSUE',
    terminalStates: ['COMPLETED', 'ESCALATED', 'ABANDONED'],
    customerObjective: 'Create Property Irregularity Report (PIR) and obtain baggage file reference.',
    maxTurns: 20,
    requiredFacts: [
      { key: 'pnr', label: 'PNR', generator: 'synthetic_pnr', required: true, disclosurePolicy: 'on_request' },
      { key: 'baggageTag', label: 'Baggage Tag Number', generator: 'synthetic_amount', required: true, disclosurePolicy: 'on_request' },
      { key: 'flightNumber', label: 'Flight Number', generator: 'synthetic_flight', required: true, disclosurePolicy: 'initial' },
    ],
    stateMachine: {
      INTRODUCE_ISSUE: {
        description: 'Customer reports missing baggage.',
        allowedFacts: ['flightNumber'],
        transitions: [{ event: 'AGENT_ASKED_FOR_TAG', targetState: 'PROVIDE_PIR_OR_TAG' }],
      },
      PROVIDE_PIR_OR_TAG: {
        description: 'Customer provides tag number and PNR.',
        allowedFacts: ['pnr', 'baggageTag'],
        transitions: [{ event: 'TAG_VERIFIED', targetState: 'TRACE_BAGGAGE' }],
      },
      TRACE_BAGGAGE: {
        description: 'Agent queries WorldTracer or baggage status.',
        allowedFacts: [],
        transitions: [{ event: 'BAGGAGE_LOCATED_OR_PIR_CREATED', targetState: 'COMPLETED' }],
      },
      COMPLETED: { description: 'PIR filed with delivery timeline', allowedFacts: [], transitions: [] },
      ESCALATED: { description: 'Escalated', allowedFacts: [], transitions: [] },
      ABANDONED: { description: 'Abandoned', allowedFacts: [], transitions: [] },
    },
    successCriteria: [
      { criterionId: 'SC01', description: 'Baggage claim reference recorded', eventType: 'TAG_VERIFIED', required: true },
    ],
  },

  {
    scenarioId: 'S005',
    name: 'Booking Modification',
    category: 'booking',
    description: 'Passenger wishes to change departure flight date by 2 days.',
    initialState: 'INTRODUCE_ISSUE',
    terminalStates: ['COMPLETED', 'ESCALATED', 'ABANDONED'],
    customerObjective: 'Modify ticket date and confirm seat allocation.',
    maxTurns: 18,
    requiredFacts: [
      { key: 'pnr', label: 'PNR', generator: 'synthetic_pnr', required: true, disclosurePolicy: 'on_request' },
      { key: 'passengerName', label: 'Passenger Name', generator: 'synthetic_name', required: true, disclosurePolicy: 'initial' },
      { key: 'travelDate', label: 'New Requested Date', generator: 'synthetic_date', required: true, disclosurePolicy: 'on_request' },
    ],
    stateMachine: {
      INTRODUCE_ISSUE: {
        description: 'Customer asks for date change.',
        allowedFacts: ['passengerName'],
        transitions: [{ event: 'AGENT_ASKED_FOR_PNR', targetState: 'PROVIDE_BOOKING_DETAILS' }],
      },
      PROVIDE_BOOKING_DETAILS: {
        description: 'Customer shares PNR and new date.',
        allowedFacts: ['pnr', 'travelDate'],
        transitions: [{ event: 'BOOKING_IDENTIFIED', targetState: 'SELECT_NEW_FLIGHT' }],
      },
      SELECT_NEW_FLIGHT: {
        description: 'Agent quotes availability and fare difference.',
        allowedFacts: [],
        transitions: [{ event: 'FARE_DIFFERENCE_QUOTED', targetState: 'CONFIRM_MODIFICATION' }],
      },
      CONFIRM_MODIFICATION: {
        description: 'Customer confirms modification.',
        allowedFacts: [],
        transitions: [{ event: 'REBOOKING_COMPLETED', targetState: 'COMPLETED' }],
      },
      COMPLETED: { description: 'Booking updated', allowedFacts: [], transitions: [] },
      ESCALATED: { description: 'Escalated', allowedFacts: [], transitions: [] },
      ABANDONED: { description: 'Abandoned', allowedFacts: [], transitions: [] },
    },
    successCriteria: [
      { criterionId: 'SC01', description: 'Rebooking processed', eventType: 'REBOOKING_COMPLETED', required: true },
    ],
  },

  {
    scenarioId: 'S006',
    name: 'Online Check-in Failure',
    category: 'checkin',
    description: 'Airline website throws error "ERR-402: Passenger profile mismatch" during web check-in.',
    initialState: 'INTRODUCE_ISSUE',
    terminalStates: ['COMPLETED', 'ESCALATED', 'ABANDONED'],
    customerObjective: 'Clear check-in block or have agent issue digital boarding pass.',
    maxTurns: 15,
    requiredFacts: [
      { key: 'pnr', label: 'PNR', generator: 'synthetic_pnr', required: true, disclosurePolicy: 'on_request' },
      { key: 'passengerName', label: 'Passenger Name', generator: 'synthetic_name', required: true, disclosurePolicy: 'initial' },
    ],
    stateMachine: {
      INTRODUCE_ISSUE: {
        description: 'Customer reports check-in portal error.',
        allowedFacts: ['passengerName'],
        transitions: [{ event: 'AGENT_ASKED_FOR_PNR', targetState: 'PROVIDE_BOOKING_DETAILS' }],
      },
      PROVIDE_BOOKING_DETAILS: {
        description: 'Customer gives PNR.',
        allowedFacts: ['pnr'],
        transitions: [{ event: 'BOOKING_IDENTIFIED', targetState: 'TROUBLESHOOT_ERROR' }],
      },
      TROUBLESHOOT_ERROR: {
        description: 'Agent resolves passport/name mismatch.',
        allowedFacts: [],
        transitions: [{ event: 'CHECKIN_COMPLETED', targetState: 'COMPLETED' }],
      },
      COMPLETED: { description: 'Boarding pass issued', allowedFacts: [], transitions: [] },
      ESCALATED: { description: 'Escalated', allowedFacts: [], transitions: [] },
      ABANDONED: { description: 'Abandoned', allowedFacts: [], transitions: [] },
    },
    successCriteria: [
      { criterionId: 'SC01', description: 'Checkin resolved', eventType: 'CHECKIN_COMPLETED', required: true },
    ],
  },

  {
    scenarioId: 'S007',
    name: 'Missed Connection',
    category: 'disruption',
    description: 'First leg arrived 1 hour late, causing passenger to miss the connecting international leg.',
    initialState: 'INTRODUCE_ISSUE',
    terminalStates: ['COMPLETED', 'ESCALATED', 'ABANDONED'],
    customerObjective: 'Get rebooked on the next available flight and receive hotel accommodation voucher.',
    maxTurns: 20,
    requiredFacts: [
      { key: 'pnr', label: 'PNR', generator: 'synthetic_pnr', required: true, disclosurePolicy: 'on_request' },
      { key: 'passengerName', label: 'Passenger Name', generator: 'synthetic_name', required: true, disclosurePolicy: 'initial' },
      { key: 'flightNumber', label: 'Inbound Flight', generator: 'synthetic_flight', required: true, disclosurePolicy: 'initial' },
    ],
    stateMachine: {
      INTRODUCE_ISSUE: {
        description: 'Customer states missed connection at hub airport.',
        allowedFacts: ['passengerName', 'flightNumber'],
        transitions: [{ event: 'AGENT_ASKED_FOR_PNR', targetState: 'PROVIDE_BOOKING_DETAILS' }],
      },
      PROVIDE_BOOKING_DETAILS: {
        description: 'Customer shares PNR.',
        allowedFacts: ['pnr'],
        transitions: [{ event: 'BOOKING_IDENTIFIED', targetState: 'REBOOK_NEXT_FLIGHT' }],
      },
      REBOOK_NEXT_FLIGHT: {
        description: 'Agent rebooks onto next flight.',
        allowedFacts: [],
        transitions: [{ event: 'REBOOKING_COMPLETED', targetState: 'ARRANGE_HOTEL' }],
      },
      ARRANGE_HOTEL: {
        description: 'Agent issues hotel and meal voucher.',
        allowedFacts: [],
        transitions: [{ event: 'HOTEL_VOUCHER_ISSUED', targetState: 'COMPLETED' }],
      },
      COMPLETED: { description: 'Rebooked with stay accommodation', allowedFacts: [], transitions: [] },
      ESCALATED: { description: 'Escalated', allowedFacts: [], transitions: [] },
      ABANDONED: { description: 'Abandoned', allowedFacts: [], transitions: [] },
    },
    successCriteria: [
      { criterionId: 'SC01', description: 'Rebooking completed', eventType: 'REBOOKING_COMPLETED', required: true },
    ],
  },

  {
    scenarioId: 'S008',
    name: 'Payment Failure',
    category: 'billing',
    description: 'Customer card was charged $450, but website timed out and booking confirmation was not delivered.',
    initialState: 'INTRODUCE_ISSUE',
    terminalStates: ['COMPLETED', 'ESCALATED', 'ABANDONED'],
    customerObjective: 'Verify if booking was confirmed or release the credit card authorization hold.',
    maxTurns: 16,
    requiredFacts: [
      { key: 'passengerEmail', label: 'Email', generator: 'synthetic_email', required: true, disclosurePolicy: 'initial' },
      { key: 'paymentReference', label: 'Bank Transaction Ref', generator: 'synthetic_amount', required: true, disclosurePolicy: 'on_request' },
    ],
    stateMachine: {
      INTRODUCE_ISSUE: {
        description: 'Customer reports card debited without ticket.',
        allowedFacts: ['passengerEmail'],
        transitions: [{ event: 'AGENT_ASKED_FOR_PAYMENT_REF', targetState: 'PROVIDE_PAYMENT_DETAILS' }],
      },
      PROVIDE_PAYMENT_DETAILS: {
        description: 'Customer supplies bank payment reference.',
        allowedFacts: ['paymentReference'],
        transitions: [{ event: 'PAYMENT_LOOKUP_COMPLETED', targetState: 'RESOLVE_PAYMENT' }],
      },
      RESOLVE_PAYMENT: {
        description: 'Agent issues ticket or initiates charge release.',
        allowedFacts: [],
        transitions: [
          { event: 'TICKET_CONFIRMED', targetState: 'COMPLETED' },
          { event: 'CHARGE_HOLD_RELEASED', targetState: 'COMPLETED' },
        ],
      },
      COMPLETED: { description: 'Payment issue resolved', allowedFacts: [], transitions: [] },
      ESCALATED: { description: 'Escalated', allowedFacts: [], transitions: [] },
      ABANDONED: { description: 'Abandoned', allowedFacts: [], transitions: [] },
    },
    successCriteria: [
      { criterionId: 'SC01', description: 'Payment verified and ticket or release delivered', eventType: 'COMPLETED', required: true },
    ],
  },
];

export const seedScenarios = async () => {
  logger.info(`Starting idempotent seeding of ${scenariosData.length} scenarios...`);
  let created = 0;
  let updated = 0;

  for (const s of scenariosData) {
    const res = await Scenario.findOneAndUpdate(
      { scenarioId: s.scenarioId },
      { $set: s },
      { upsert: true, new: false }
    );
    if (res) updated++;
    else created++;
  }

  logger.info(`Scenarios seeding complete. Created: ${created}, Updated: ${updated}`);
};

if (process.argv[1] && process.argv[1].endsWith('scenarios.seed.js')) {
  (async () => {
    try {
      await mongoose.connect(env.MONGODB_URI);
      await seedScenarios();
      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      logger.error('Failed to seed scenarios:', err);
      process.exit(1);
    }
  })();
}
