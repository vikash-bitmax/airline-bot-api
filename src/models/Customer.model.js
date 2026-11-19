/**
 * Customer Model
 *
 * Stores seeded synthetic customer records from the SkyWings dataset.
 * These are used by the bot fixture generator to pick a real customer
 * identity instead of generating one algorithmically.
 *
 * Fields mirror the structure of skywings_1000_synthetic_customers.json
 * (top-level customer/booking/itinerary/ancillaries/support_context),
 * excluding the `data_type` field which is stripped on import.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// ── Sub-schemas ──────────────────────────────────────────────────────────────

const LoyaltySchema = new Schema(
  {
    membership_id: String,
    tier: String,
    points_balance: Number,
    tier_benefits_note: String,
  },
  { _id: false },
);

const BookingSchema = new Schema(
  {
    booking_id: String,
    pnr: { type: String, index: true },
    booking_status: String,
    booking_date: String,
    trip_type: String,
    cabin_class: String,
    passenger_count: Number,
    total_fare_inr: Number,
    currency: String,
    payment_method: String,
    payment_status: String,
  },
  { _id: false },
);

const FlightLegSchema = new Schema(
  {
    flight_number: String,
    airline: String,
    origin_city: String,
    origin_airport: String,
    origin_airport_name: String,
    destination_city: String,
    destination_airport: String,
    destination_airport_name: String,
    departure_date: String,
    departure_time_local: String,
    arrival_time_local: String,
    flight_status: String,
    aircraft: String,
    seat: String,
  },
  { _id: false },
);

const ItinerarySchema = new Schema(
  {
    outbound: FlightLegSchema,
    return: FlightLegSchema,
  },
  { _id: false },
);

const AncillariesSchema = new Schema(
  {
    checked_baggage_allowance_kg: Number,
    cabin_baggage_allowance_kg: Number,
    meal_preference: String,
    seat_preference: String,
    special_assistance: String,
    extra_baggage_purchased_kg: Number,
  },
  { _id: false },
);

const SupportContextSchema = new Schema(
  {
    primary_issue: String,
    issue_description: String,
    case_id: String,
    case_status: String,
    previous_contact_count: Number,
    customer_sentiment: String,
    agent_notes: String,
  },
  { _id: false },
);

const CustomerInfoSchema = new Schema(
  {
    customer_id: { type: String, index: true },
    first_name: String,
    last_name: String,
    full_name: String,
    age: Number,
    passenger_type: String,
    email: String,
    phone: String,
    preferred_language: String,
    preferred_channel: String,
    home_city: String,
  },
  { _id: false },
);

// ── Main Schema ───────────────────────────────────────────────────────────────

const CustomerSchema = new Schema(
  {
    record_id: { type: String, unique: true, index: true },
    customer: CustomerInfoSchema,
    loyalty: LoyaltySchema,
    booking: BookingSchema,
    itinerary: ItinerarySchema,
    ancillaries: AncillariesSchema,
    support_context: SupportContextSchema,
    // conversation_guidance is intentionally omitted — used at prompt-build time only
  },
  {
    timestamps: true,
    collection: 'customers',
  },
);

const Customer = model('Customer', CustomerSchema);

export default Customer;
