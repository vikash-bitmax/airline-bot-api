import { Router } from 'express';
import {
  getScenarios,
  getScenarioById,
  createScenario,
  updateScenario,
  deleteScenario,
} from '../controllers/scenario.controller.js';

const router = Router();

router.get('/', getScenarios);
router.get('/:scenarioId', getScenarioById);
router.post('/', createScenario);
router.patch('/:scenarioId', updateScenario);
router.delete('/:scenarioId', deleteScenario);

export default router;
