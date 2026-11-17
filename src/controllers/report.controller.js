import { getOverviewReport, getRunReport } from '../services/reporting.service.js';
import Conversation from '../models/Conversation.model.js';
import Persona from '../models/Persona.model.js';
import Scenario from '../models/Scenario.model.js';

export const getOverview = async (req, res, next) => {
  try {
    const report = await getOverviewReport();
    return res.status(200).json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
};

export const getRunReportById = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const report = await getRunReport(runId);
    return res.status(200).json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
};

export const getPersonaReport = async (req, res, next) => {
  try {
    const { personaId } = req.params;
    const persona = await Persona.findOne({ personaId }).lean();
    if (!persona) return res.status(404).json({ success: false, message: 'Persona not found' });

    const conversations = await Conversation.find({ persona: persona._id }).lean();
    const total = conversations.length;
    const completed = conversations.filter((c) => c.status === 'COMPLETED').length;

    return res.status(200).json({
      success: true,
      data: {
        persona,
        metrics: {
          totalConversations: total,
          completed,
          averageScore: total
            ? Math.round(conversations.reduce((acc, c) => acc + (c.outcome?.score || 0), 0) / total)
            : 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getScenarioReport = async (req, res, next) => {
  try {
    const { scenarioId } = req.params;
    const scenario = await Scenario.findOne({ scenarioId }).lean();
    if (!scenario) return res.status(404).json({ success: false, message: 'Scenario not found' });

    const conversations = await Conversation.find({ scenario: scenario._id }).lean();
    const total = conversations.length;
    const completed = conversations.filter((c) => c.status === 'COMPLETED').length;

    return res.status(200).json({
      success: true,
      data: {
        scenario,
        metrics: {
          totalConversations: total,
          completed,
          completionRate: total ? Math.round((completed / total) * 100) : 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
