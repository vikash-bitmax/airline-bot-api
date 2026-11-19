import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const ViolationSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      enum: [
        'INCOMPLETE_RESOLUTION',
        'INCORRECT_INFORMATION',
        'INCOMPLETE_TROUBLESHOOTING',
        'MISLEADING_INFORMATION',
        'WRONG_IDENTIFICATION',
        'ALIAS_VIOLATION',
        'ESCALATION_DELAY',
        'IN_PROGRESS',
        'IN_QUEUE',
        'POOR_INTERACTION_HANDLING',
        'CUSTOMER_NAME_ERROR',
        'GRAMMATICAL',
        'GREETING_ERROR',
        'CLOSING_ERROR',
        'ART',
        'AHT',
      ],
    },
    category: {
      type: String,
      enum: ['CRITICAL', 'MISLEADING', 'PROCESS_COMPLIANCE', 'COMMUNICATION_QUALITY', 'TIMELINESS', 'EFFICIENCY'],
      required: true,
    },
    deduction: { type: Number, required: true },
    reason: { type: String, required: true },
    evidence: { type: String, default: '' },
  },
  { _id: false },
);

const TierEvaluationSchema = new Schema(
  {
    tier: { type: String, enum: ['L1', 'L2'], required: true },
    label: { type: String, required: true }, // 'Agent (L1)' or 'TL/QA (L2)'
    score: { type: Number, min: 0, max: 100, required: true },
    passed: { type: Boolean, required: true },
    hasCriticalError: { type: Boolean, default: false },
    violations: [ViolationSchema],
    totalDeductions: { type: Number, default: 0 },
    feedback: { type: String, default: '' },
    metrics: {
      artSeconds: { type: Number, default: 0 },
      artExceeded: { type: Boolean, default: false },
      ahtSeconds: { type: Number, default: 0 },
      ahtExceeded: { type: Boolean, default: false },
      messageCount: { type: Number, default: 0 },
    },
  },
  { _id: false },
);

const QcReportSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    conversationId: { type: String, required: true, index: true },
    pnr: { type: String, default: '' },
    customerName: { type: String, default: '' },
    agentName: { type: String, default: 'Frontline Agent' },
    status: {
      type: String,
      enum: ['PASS', 'FAIL', 'CRITICAL_FAIL'],
      required: true,
    },
    overallScore: { type: Number, min: 0, max: 100, required: true },
    l1Agent: TierEvaluationSchema,
    l2TlQa: TierEvaluationSchema,
    criticalErrorsCount: { type: Number, default: 0 },
    evaluatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'qc_reports',
  },
);

const QcReport = model('QcReport', QcReportSchema);

export default QcReport;
