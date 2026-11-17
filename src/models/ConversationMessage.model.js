
import mongoose from "mongoose";

const conversationMessageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
    },

    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    sequenceNumber: {
      type: Number,
      required: true,
    },

    senderType: {
      type: String,
      enum: ["CUSTOMER", "AGENT", "SYSTEM"],
      required: true,
    },

    senderId: String,

    content: {
      type: String,
      required: true,
    },

    messageType: {
      type: String,
      enum: ["TEXT", "FILE", "IMAGE", "SYSTEM_EVENT"],
      default: "TEXT",
    },

    crmMessageId: String,

    deliveryStatus: {
      type: String,
      enum: ["PENDING", "SENT", "DELIVERED", "FAILED"],
      default: "PENDING",
    },

    aiMetadata: {
      generated: { type: Boolean, default: false },
      provider: String,
      model: String,
      intent: String,
      emotionExpression: String,
      behaviorTags: [{ type: String }],
      generationLatencyMs: Number,
      promptTokens: Number,
      completionTokens: Number,
    },

    idempotencyKey: String,

    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationMessageSchema.index(
  { conversation: 1, sequenceNumber: 1 },
  { unique: true }
);

conversationMessageSchema.index({
  conversation: 1,
  sentAt: 1,
});

export default mongoose.model(
  "ConversationMessage",
  conversationMessageSchema
);
