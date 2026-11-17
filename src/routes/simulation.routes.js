import { Router } from 'express';
import {
  createSimulation,
  getSimulations,
  getSimulationById,
  startSimulation,
  pauseSimulation,
  resumeSimulation,
  cancelSimulation,
} from '../controllers/simulation.controller.js';

const router = Router();

router.post('/', createSimulation);
router.get('/', getSimulations);
router.get('/:runId', getSimulationById);
router.post('/:runId/start', startSimulation);
router.post('/:runId/pause', pauseSimulation);
router.post('/:runId/resume', resumeSimulation);
router.post('/:runId/cancel', cancelSimulation);

export default router;
