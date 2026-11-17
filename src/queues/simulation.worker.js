import { Worker } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { connectDB, disconnectDB } from '../config/database.js';
import conversationOrchestrator from '../services/conversation-orchestrator.service.js';
import SimulationRun from '../models/SimulationRun.model.js';
import logger from '../utils/logger.js';

let worker = null;

export const startWorker = async () => {
  await connectDB();

  worker = new Worker(
    'simulation-queue',
    async (job) => {
      logger.info(`Processing BullMQ job ${job.name} [ID: ${job.id}]`);

      switch (job.name) {
        case 'START_CONVERSATION': {
          const { runId, personaId, scenarioId, randomSeed, useMockCrm } = job.data;
          await conversationOrchestrator.startConversation({
            runId,
            personaId,
            scenarioId,
            randomSeed,
            useMockCrm,
          });
          break;
        }

        case 'START_SIMULATION_RUN': {
          const { runId, useMockCrm } = job.data;
          const run = await SimulationRun.findOne({ runId });
          if (!run) throw new Error(`Run not found: ${runId}`);

          await SimulationRun.findByIdAndUpdate(run._id, { $set: { status: 'RUNNING' } });

          // Spawn conversations based on strategy
          const personas = run.selection?.personaIds || [];
          const scenarios = run.selection?.scenarioIds || [];

          for (const pid of personas) {
            for (const sid of scenarios) {
              await conversationOrchestrator.startConversation({
                runId: run.runId,
                personaId: pid,
                scenarioId: sid,
                randomSeed: run.configuration?.randomSeed,
                useMockCrm: useMockCrm ?? (run.environment === 'TEST'),
              });
            }
          }
          break;
        }

        default:
          logger.warn(`Unknown job name: ${job.name}`);
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} (${job.name}) completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} (${job?.name}) failed: ${err.message}`, { stack: err.stack });
  });

  logger.info('BullMQ Simulation Worker started listening for jobs');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down BullMQ worker...');
    if (worker) await worker.close();
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

if (process.argv[1] && process.argv[1].endsWith('simulation.worker.js')) {
  startWorker();
}

export default { startWorker };
