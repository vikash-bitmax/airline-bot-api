import winston from 'winston';
import { env } from '../config/environment.js';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${stack || message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'test' ? 'error' : (process.env.LOG_LEVEL || 'info'),
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    env.NODE_ENV === 'production' ? json() : combine(colorize(), consoleFormat)
  ),
  transports: [new winston.transports.Console()],
});

export default logger;
