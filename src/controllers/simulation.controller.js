import { v4 as uuidv4 } from 'uuid';
import SimulationRun from '../models/SimulationRun.model.js';
import Conversation from '../models/Conversation.model.js';
import { addSimulationJob } from '../queues/simulation.queue.js';
import conversationOrchestrator from '../services/conversation-orchestrator.service.js';
import { broadcastEvent } from '../../server.js';

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
        totalCustomers,
        concurrency,
        maxTurnsPerConversation,
        randomSeed: randomSeed || uuidv4(),
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

    // Spawn execution either via BullMQ queue or directly in orchestrator
    const personas = run.selection?.personaIds || [];
    const scenarios = run.selection?.scenarioIds || [];

    for (const pid of personas) {
      for (const sid of scenarios) {
        // Enqueue or execute async
        addSimulationJob('START_CONVERSATION', {
          runId: run.runId,
          personaId: pid,
          scenarioId: sid,
          randomSeed: run.configuration?.randomSeed,
          useMockCrm: run.environment === 'TEST',
        }).catch(() => {
          // Fallback direct run if queue is offline
          conversationOrchestrator.startConversation({
            runId: run.runId,
            personaId: pid,
            scenarioId: sid,
            randomSeed: run.configuration?.randomSeed,
            useMockCrm: run.environment === 'TEST',
          });
        });
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
