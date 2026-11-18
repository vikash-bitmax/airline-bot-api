
import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    simulationRun: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationRun",
      required: true,
      index: true,
    },

    persona: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Persona",
      required: true,
    },

    scenario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Scenario",
      required: true,
    },

    // Freeze the definitions used for reproducibility.
    personaSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    scenarioSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Generated once and retained for this conversation.
    customerFixture: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    crm: {
      externalConversationId: String,
      externalCustomerId: String,
      customerSessionToken: String,
      channel: String,
      integrationStatus: {
        type: String,
        enum: ["NOT_CREATED", "CONNECTED", "DISCONNECTED", "FAILED"],
        default: "NOT_CREATED",
      },
    },

    status: {
      type: String,
      enum: [
        "NEW",
        "WAITING",
        "ACTIVE",
        "RUNNING",
        "ESCALATED",
        "TRANSFERRED",
        "RESOLVED",
        "CLOSED",
        "COMPLETED",
        "CONCLUDED",
        "ABANDONED",
        "FAILED",
        "CANCELLED",
      ],
      default: "ACTIVE",
      index: true,
    },

    scenarioProgress: {
      currentState: { type: String, required: true },
      turnCount: { type: Number, default: 0 },
      transitionCount: { type: Number, default: 0 },
      visitedStates: [{ type: String }],
      completed: { type: Boolean, default: false },
    },

    personaState: {
      emotionalState: { type: String, default: "neutral" },
      frustration: { type: Number, min: 0, max: 10, default: 0 },
      trust: { type: Number, min: 0, max: 10, default: 5 },
      satisfaction: { type: Number, min: 0, max: 10, default: 5 },
      supervisorRequests: { type: Number, default: 0 },
      topicSwitchCount: { type: Number, default: 0 },
    },

    messageSequence: {
      type: Number,
      default: 0,
    },

    stateVersion: {
      type: Number,
      default: 0,
    },

    outcome: {
      goalAchieved: { type: Boolean, default: false },
      score: { type: Number, min: 0, max: 100 },
      assertionResults: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },

    startedAt: Date,
    endedAt: Date,
    endReason: String,
    timingConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        minWaitSec: 3,
        maxWaitSec: 6,
        maxAhtMins: 4,
        idleStopMins: 4,
        pilotMode: 'MANUAL',
      },
    },
  },
  { timestamps: true }
);

conversationSchema.index({
  simulationRun: 1,
  createdAt: -1,
});

conversationSchema.index({
  status: 1,
  updatedAt: -1,
});

export default mongoose.model("Conversation", conversationSchema);
