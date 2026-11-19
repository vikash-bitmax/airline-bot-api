import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';

if (NODE_ENV === 'production' && process.env.ALLOW_PROD !== 'true') {
  // Simulator must fail closed against production
  throw new Error('SECURITY_ERROR: Airline AI Simulator cannot run in production mode without explicit override.');
}

export const env = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || '5050', 10),
  API_PREFIX: process.env.API_PREFIX || '/api/v1',

  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/airline_crm_simulator',

  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',
    PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
    PASSWORD: process.env.REDIS_PASSWORD || undefined,
  },

  GEMINI: {
    API_KEY: process.env.GEMINI_API_KEY || '',
    MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    TIMEOUT_MS: parseInt(process.env.GEMINI_TIMEOUT_MS || '15000', 10),
    MAX_RETRIES: parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10),
  },

  CRM: {
    ENVIRONMENT: process.env.CRM_ENVIRONMENT || 'TEST',
    BASE_URL: process.env.CRM_BASE_URL || 'http://localhost:5000',
    SOCKET_URL: process.env.CRM_SOCKET_URL || 'http://localhost:5000',
    SERVICE_TOKEN: process.env.CRM_SERVICE_TOKEN || '',
    ALLOWED_HOSTS: (process.env.CRM_ALLOWED_HOSTS || 'localhost,127.0.0.1').split(',').map((h) => h.trim()),
  },

  SIMULATOR: {
    MAX_CONCURRENCY: parseInt(process.env.SIMULATOR_MAX_CONCURRENCY || '5', 10),
    MAX_TURNS: parseInt(process.env.SIMULATOR_MAX_TURNS || '20', 10),
    MAX_DURATION_MS: parseInt(process.env.SIMULATOR_MAX_DURATION_MS || '600000', 10), // 10 minutes
    MAX_MESSAGES: parseInt(process.env.SIMULATOR_MAX_MESSAGES || '50', 10),
    MAX_TOKEN_BUDGET: parseInt(process.env.SIMULATOR_MAX_TOKEN_BUDGET || '100000', 10),
  },

  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
};

export const validateEnvironment = () => {
  if (env.CRM.ENVIRONMENT === 'PRODUCTION') {
    throw new Error('SECURITY VIOLATION: Simulator cannot target CRM PRODUCTION environment.');
  }

  // Validate CRM base URL against allowed hosts
  try {
    const url = new URL(env.CRM.BASE_URL);
    const isAllowed = env.CRM.ALLOWED_HOSTS.some(
      (h) => url.hostname === h || url.hostname.endsWith(`.${h}`)
    );
    if (!isAllowed) {
      throw new Error(`SECURITY VIOLATION: CRM host ${url.hostname} is not in CRM_ALLOWED_HOSTS list.`);
    }
  } catch (err) {
    if (err.message.startsWith('SECURITY VIOLATION')) throw err;
    throw new Error(`Invalid CRM_BASE_URL: ${env.CRM.BASE_URL}`);
  }
};
