import { v4 as uuidv4 } from 'uuid';
import SimulationRun from '../models/SimulationRun.model.js';
import Conversation from '../models/Conversation.model.js';
import ConversationMessage from '../models/ConversationMessage.model.js';
import ConversationEvent from '../models/ConversationEvent.model.js';
import crmSocketClient from '../integrations/crm/crm-socket.client.js';
import conversationOrchestrator from '../services/conversation-orchestrator.service.js';
import { broadcastEvent } from '../../server.js';
import logger from '../utils/logger.js';

export const createSimulation = async (req, res, next) => {
  try {
    const {
      name,
      environment = 'TEST',
      personaIds = [],
      scenarioIds = [],
      strategy = 'MANUAL',
      totalCustomers = 1,
      concurrency = 1,
      maxTurnsPerConversation = 20,
      randomSeed,
    } = req.body;

    const runId = `RUN-${uuidv4().substring(0, 8).toUpperCase()}`;

    const randomSeedVal =
      (randomSeed && String(randomSeed).trim()) ||
      (req.body?.configuration?.randomSeed && String(req.body.configuration.randomSeed).trim()) ||
      uuidv4();

    const simulation = await SimulationRun.create({
      runId,
      name: name || `Simulation ${runId}`,
      environment,
      status: 'PENDING',
      selection: {
        personaIds,
        scenarioIds,
        strategy,
      },
      configuration: {
        totalCustomers: totalCustomers || req.body?.configuration?.totalCustomers || 1,
        concurrency: concurrency || req.body?.configuration?.concurrency || 1,
        maxTurnsPerConversation: maxTurnsPerConversation || req.body?.configuration?.maxTurnsPerConversation || 20,
        randomSeed: randomSeedVal,
      },
    });

    return res.status(201).json({ success: true, data: simulation });
  } catch (err) {
    next(err);
  }
};

export const getSimulations = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const runs = await SimulationRun.find(filter).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, count: runs.length, data: runs });
  } catch (err) {
    next(err);
  }
};

export const getSimulationById = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const run = await SimulationRun.findOne({ runId }).lean();
    if (!run) {
      return res.status(404).json({ success: false, message: 'Simulation run not found' });
    }

    const conversations = await Conversation.find({ simulationRun: run._id })
      .populate('persona')
      .populate('scenario')
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        run,
        conversations,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const startSimulation = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const run = await SimulationRun.findOne({ runId });
    if (!run) {
      return res.status(404).json({ success: false, message: 'Simulation run not found' });
    }

    run.status = 'RUNNING';
    run.startedAt = new Date();
    await run.save();

    broadcastEvent('simulation:started', { runId: run.runId });

    // Spawn execution across personas and scenarios
    const personas = run.selection?.personaIds || [];
    const scenarios = run.selection?.scenarioIds || [];
    const totalCustomers = run.configuration?.totalCustomers || 1;

    for (const pid of personas) {
      for (const sid of scenarios) {
        for (let i = 0; i < totalCustomers; i++) {
          const conversationSeed = `${run.configuration?.randomSeed || 'seed'}-${i}`;
          // Launch directly so simulation starts immediately in all environments
          conversationOrchestrator
            .startConversation({
              runId: run.runId,
              personaId: pid,
              scenarioId: sid,
              randomSeed: conversationSeed,
              useMockCrm: run.environment === 'TEST',
            })
            .catch((err) => {
              logger.error(
                `Failed to launch conversation ${i + 1}/${totalCustomers} for run ${run.runId}: ${err.message}`
              );
            });
        }
      }
    }

    return res.status(200).json({ success: true, message: 'Simulation started', data: run });
  } catch (err) {
    next(err);
  }
};

export const pauseSimulation = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const run = await SimulationRun.findOneAndUpdate(
      { runId },
      { $set: { status: 'PAUSED' } },
      { new: true }
    );
    if (!run) return res.status(404).json({ success: false, message: 'Simulation run not found' });
    broadcastEvent('simulation:paused', { runId: run.runId });
    return res.status(200).json({ success: true, data: run });
  } catch (err) {
    next(err);
  }
};

export const resumeSimulation = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const run = await SimulationRun.findOneAndUpdate(
      { runId },
      { $set: { status: 'RUNNING' } },
      { new: true }
    );
    if (!run) return res.status(404).json({ success: false, message: 'Simulation run not found' });
    broadcastEvent('simulation:resumed', { runId: run.runId });
    return res.status(200).json({ success: true, data: run });
  } catch (err) {
    next(err);
  }
};

export const cancelSimulation = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const run = await SimulationRun.findOneAndUpdate(
      { runId },
      { $set: { status: 'CANCELLED', completedAt: new Date() } },
      { new: true }
    );
    if (!run) return res.status(404).json({ success: false, message: 'Simulation run not found' });
    broadcastEvent('simulation:cancelled', { runId: run.runId });
    return res.status(200).json({ success: true, data: run });
  } catch (err) {
    next(err);
  }
};

export const deleteSimulation = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const run = await SimulationRun.findOne({ runId });
    if (!run) {
      return res.status(404).json({ success: false, message: 'Simulation run not found' });
    }

    // Find all conversations belonging to this simulation run
    const conversations = await Conversation.find({ simulationRun: run._id })
      .select('_id conversationId')
      .lean();
    const convIds = conversations.map((c) => c._id);

    // Disconnect any active sockets for these conversations
    conversations.forEach((c) => {
      crmSocketClient.disconnectConversation(c.conversationId);
    });

    // Cascade delete: messages, events, conversations, and the simulation run
    await Promise.all([
      ConversationMessage.deleteMany({ conversation: { $in: convIds } }),
      ConversationEvent.deleteMany({ conversation: { $in: convIds } }),
      Conversation.deleteMany({ simulationRun: run._id }),
      SimulationRun.deleteOne({ _id: run._id }),
    ]);

    broadcastEvent('simulation:deleted', { runId });

    return res.status(200).json({
      success: true,
      message: `Simulation ${runId} and ${convIds.length} associated conversation(s) deleted successfully`,
    });
  } catch (err) {
    next(err);
  }
};
