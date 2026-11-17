import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import logger from '../utils/logger.js';

let simulationQueue = null;

export const getSimulationQueue = () => {
  if (!simulationQueue) {
    try {
      simulationQueue = new Queue('simulation-queue', {
        connection: getRedisConnectionOptions(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      });
      logger.info('BullMQ simulation-queue initialized');
    } catch (err) {
      logger.warn(`Failed to initialize BullMQ queue: ${err.message}`);
    }
  }
  return simulationQueue;
};

export const addSimulationJob = async (jobName, data, options = {}) => {
  const queue = getSimulationQueue();
  if (!queue) {
    logger.warn(`Queue not available, executing ${jobName} synchronously`);
    return null;
  }
  return await queue.add(jobName, data, options);
};

export default {
  getSimulationQueue,
  addSimulationJob,
};
