
import mongoose from "mongoose";

const score = {
  type: Number,
  min: 0,
  max: 10,
  default: 5,
};

const personaSchema = new mongoose.Schema(
  {
    personaId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    version: {
      type: Number,
      default: 1,
      min: 1,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: [
        "personality",
        "communication",
        "behavioural",
        "accessibility",
        "edge_case",
      ],
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    tags: [{ type: String }],

    traits: {
      emotionalState: {
        type: String,
        enum: [
          "happy",
          "calm",
          "neutral",
          "confused",
          "anxious",
          "frustrated",
          "angry",
        ],
        default: "neutral",
      },

      patience: score,
      cooperation: score,
      assertiveness: score,
      escalationTendency: score,
      trustLevel: score,
    },

    communication: {
      language: {
        type: String,
        default: "English",
      },

      proficiency: {
        type: String,
        enum: ["basic", "intermediate", "fluent"],
        default: "fluent",
      },

      style: {
        type: String,
        enum: [
          "formal",
          "polite",
          "casual",
          "direct",
          "indirect",
        ],
        default: "polite",
      },

      messageLength: {
        type: String,
        enum: ["short", "medium", "long"],
        default: "medium",
      },

      emojiUsage: {
        type: String,
        enum: ["none", "occasional", "frequent"],
        default: "none",
      },

      responseDelay: {
        minMs: { type: Number, min: 0, default: 1000 },
        maxMs: { type: Number, min: 0, default: 4000 },
      },

      grammarNoise: {
        type: String,
        enum: ["none", "low", "medium"],
        default: "none",
      },
    },

    behaviour: {
      repeatQuestions: {
        enabled: { type: Boolean, default: false },
        onlyIfUnresolved: { type: Boolean, default: true },
        maxRepeats: { type: Number, min: 0, default: 1 },
        repeatAfterTurns: { type: Number, min: 1, default: 2 },
      },

      topicSwitching: {
        enabled: { type: Boolean, default: false },
        probability: { type: Number, min: 0, max: 1, default: 0 },
        maxSwitches: { type: Number, min: 0, default: 0 },
      },

      informationSharing: {
        style: {
          type: String,
          enum: ["eager", "normal", "reluctant"],
          default: "normal",
        },

        initialDisclosure: [{ type: String }],
        discloseOnRequest: [{ type: String }],
        withholdUntilAsked: [{ type: String }],
        allowContradiction: { type: Boolean, default: false },
      },

      requestSupervisor: {
        enabled: { type: Boolean, default: false },
        afterUnresolvedAttempts: {
          type: Number,
          min: 1,
          default: 2,
        },
      },

      abandonment: {
        enabled: { type: Boolean, default: false },
        afterNoResponseMs: {
          type: Number,
          min: 1000,
          default: 120000,
        },
      },

      reconnection: {
        enabled: { type: Boolean, default: false },
        maxAttempts: { type: Number, min: 0, default: 1 },
      },

      duplicateMessages: {
        enabled: { type: Boolean, default: false },
        maxDuplicates: { type: Number, min: 0, default: 1 },
      },

      contradictoryInformation: {
        enabled: { type: Boolean, default: false },
        maxContradictions: { type: Number, min: 0, default: 1 },
      },
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

personaSchema.index({ category: 1, isActive: 1 });

export default mongoose.model("Persona", personaSchema);
