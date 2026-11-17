import http from 'http';
import { Server } from 'socket.io';
import app from './src/app.js';
import { env, validateEnvironment } from './src/config/environment.js';
import { connectDB, disconnectDB } from './src/config/database.js';
import { closeRedis } from './src/config/redis.js';
import logger from './src/utils/logger.js';

let io = null;

export const getIo = () => {
  if (!io) {
    throw new Error('Socket.IO is not initialized yet');
  }
  return io;
};

export const broadcastEvent = (event, payload) => {
  if (io) {
    io.emit(event, payload);
    if (payload?.conversationId) {
      io.to(`conversation:${payload.conversationId}`).emit(event, payload);
    }
    if (payload?.runId) {
      io.to(`simulation:${payload.runId}`).emit(event, payload);
    }
  }
};

const startServer = async () => {
  try {
    validateEnvironment();
    await connectDB();

    const server = http.createServer(app);

    io = new Server(server, {
      cors: {
        origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
        credentials: true,
      },
    });

    io.on('connection', (socket) => {
      logger.debug(`Dashboard socket connected: ${socket.id}`);

      socket.on('subscribe:conversation', (conversationId) => {
        if (conversationId) {
          socket.join(`conversation:${conversationId}`);
        }
      });

      socket.on('subscribe:simulation', (runId) => {
        if (runId) {
          socket.join(`simulation:${runId}`);
        }
      });

      socket.on('disconnect', () => {
        logger.debug(`Dashboard socket disconnected: ${socket.id}`);
      });
    });

    server.listen(env.PORT, () => {
      logger.info(`Airline AI Simulator running on port ${env.PORT} in ${env.NODE_ENV} mode`);
      logger.info(`Health check available at http://localhost:${env.PORT}/health`);
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down simulator gracefully...`);
      server.close(async () => {
        logger.info('HTTP server closed.');
        await disconnectDB();
        await closeRedis();
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Forceful shutdown timeout reached.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start Airline AI Simulator:', error);
    process.exit(1);
  }
};

// Start if executed directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}

export { app, startServer };
