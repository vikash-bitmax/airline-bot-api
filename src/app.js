import express from 'express';
import cors from 'cors';
import { env } from './config/environment.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';

import personaRoutes from './routes/persona.routes.js';
import scenarioRoutes from './routes/scenario.routes.js';
import simulationRoutes from './routes/simulation.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import reportRoutes from './routes/report.routes.js';

const app = express();

app.use(
  cors({
    origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000', 'http://localhost:5050'],
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Mount API routes
const prefix = env.API_PREFIX;
app.use(`${prefix}/personas`, personaRoutes);
app.use(`${prefix}/scenarios`, scenarioRoutes);
app.use(`${prefix}/simulations`, simulationRoutes);
app.use(`${prefix}/conversations`, conversationRoutes);
app.use(`${prefix}/reports`, reportRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
