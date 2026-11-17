
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const simulationRunSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
    },

    name: { type: String, required: true },

    environment: {
      type: String,
      enum: ["LOCAL", "TEST", "STAGING"],
      required: true,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "RUNNING",
        "PAUSED",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
      ],
      default: "PENDING",
      index: true,
    },

    selection: {
      personaIds: [{ type: String }],
      scenarioIds: [{ type: String }],
      strategy: {
        type: String,
        enum: ["MANUAL", "ALL_COMBINATIONS", "RANDOM"],
        default: "MANUAL",
      },
    },

    configuration: {
      totalCustomers: { type: Number, min: 1, default: 1 },
      concurrency: { type: Number, min: 1, default: 1 },
      maxTurnsPerConversation: { type: Number, min: 1, default: 20 },
      randomSeed: { type: String, required: true, default: () => uuidv4() },
      aiProvider: String,
      aiModel: String,
    },

    statistics: {
      totalConversations: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      active: { type: Number, default: 0 },
      totalMessages: { type: Number, default: 0 },
      passedAssertions: { type: Number, default: 0 },
      failedAssertions: { type: Number, default: 0 },
    },

    startedAt: Date,
    completedAt: Date,

    createdBy: String,
  },
  { timestamps: true }
);

simulationRunSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("SimulationRun", simulationRunSchema);
