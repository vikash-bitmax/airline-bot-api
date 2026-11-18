import { Router } from 'express';
import {
  createSimulation,
  getSimulations,
  getSimulationById,
  startSimulation,
  pauseSimulation,
  resumeSimulation,
  cancelSimulation,
  deleteSimulation,
} from '../controllers/simulation.controller.js';

const router = Router();

router.post('/', createSimulation);
router.get('/', getSimulations);
router.get('/:runId', getSimulationById);
router.post('/:runId/start', startSimulation);
router.post('/:runId/pause', pauseSimulation);
router.post('/:runId/resume', resumeSimulation);
router.post('/:runId/cancel', cancelSimulation);
router.post('/:runId/stop', cancelSimulation);
router.delete('/:runId', deleteSimulation);

export default router;
