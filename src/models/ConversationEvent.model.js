
import mongoose from "mongoose";

const conversationEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },

    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    eventType: {
      type: String,
      required: true,
      index: true,
    },

    source: {
      type: String,
      enum: [
        "SCENARIO_ENGINE",
        "CRM",
        "AI_INTERPRETER",
        "PERSONA_ENGINE",
        "SYSTEM",
      ],
      required: true,
    },

    evidenceType: {
      type: String,
      enum: [
        "CRM_RECORD",
        "CRM_WEBHOOK",
        "AGENT_MESSAGE",
        "CUSTOMER_MESSAGE",
        "INTERNAL_RULE",
      ],
    },

    evidenceReference: String,

    previousState: String,
    currentState: String,

    accepted: { type: Boolean, default: false },
    rejectionReason: String,

    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    idempotencyKey: String,

    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationEventSchema.index({
  conversation: 1,
  occurredAt: 1,
});

export default mongoose.model(
  "ConversationEvent",
  conversationEventSchema
);
