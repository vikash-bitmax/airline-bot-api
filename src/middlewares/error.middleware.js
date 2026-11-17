import logger from '../utils/logger.js';
import { env } from '../config/environment.js';

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
  const message = err.message || 'Internal Server Error';

  logger.error(`[${req.method}] ${req.originalUrl} - ${statusCode} - ${message}`, {
    stack: err.stack,
  });

  return res.status(statusCode).json({
    success: false,
    message,
    code: err.code || 'SERVER_ERROR',
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Resource not found: [${req.method}] ${req.originalUrl}`,
  });
};
