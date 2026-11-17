import Redis from 'ioredis';
import { env } from './environment.js';
import logger from '../utils/logger.js';

let redisClient = null;

export const getRedisConnectionOptions = () => ({
  host: env.REDIS.HOST,
  port: env.REDIS.PORT,
  password: env.REDIS.PASSWORD,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

export const getRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(getRedisConnectionOptions());

    redisClient.on('connect', () => {
      logger.info(`Redis connected to ${env.REDIS.HOST}:${env.REDIS.PORT}`);
    });

    redisClient.on('error', (err) => {
      logger.warn(`Redis connection warning: ${err.message}`);
    });
  }
  return redisClient;
};

export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed cleanly');
  }
};
