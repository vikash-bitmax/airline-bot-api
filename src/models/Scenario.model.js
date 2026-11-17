
import mongoose from "mongoose";

const factDefinitionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },

    generator: {
      type: String,
      enum: [
        "synthetic_pnr",
        "synthetic_name",
        "synthetic_email",
        "synthetic_phone",
        "synthetic_flight",
        "synthetic_route",
        "synthetic_date",
        "fixed_enum",
        "synthetic_amount",
      ],
      required: true,
    },

    required: { type: Boolean, default: true },

    disclosurePolicy: {
      type: String,
      enum: [
        "initial",
        "on_request",
        "after_verification",
        "internal_only",
      ],
      default: "on_request",
    },

    constraints: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const transitionSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    targetState: { type: String, required: true },
  },
  { _id: false }
);

const stateSchema = new mongoose.Schema(
  {
    stateId: { type: String, required: true },
    objective: { type: String, required: true },
    customerGoal: { type: String, required: true },

    allowedFactKeys: [{ type: String }],

    expectedAgentEvents: [{ type: String }],

    transitions: [transitionSchema],

    isTerminal: { type: Boolean, default: false },
  },
  { _id: false }
);

const scenarioSchema = new mongoose.Schema(
  {
    scenarioId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    version: { type: Number, default: 1, min: 1 },

    name: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      required: true,
      index: true,
    },

    description: {
      type: String,
      required: true,
    },

    initialState: {
      type: String,
      required: true,
    },

    factDefinitions: {
      type: [factDefinitionSchema],
      default: [],
    },

    states: {
      type: [stateSchema],
      required: true,
    },

    maxTurns: {
      type: Number,
      min: 1,
      default: 20,
    },

    successCriteria: [{
      criterionId: String,
      description: String,
      eventType: String,
      required: { type: Boolean, default: true },
      evidenceSource: {
        type: String,
        enum: ["CRM_EVENT", "SEMANTIC_EVENT", "CUSTOMER_ACK"],
      },
    }],

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

scenarioSchema.index({ category: 1, isActive: 1 });

export default mongoose.model("Scenario", scenarioSchema);
