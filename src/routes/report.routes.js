import { Router } from 'express';
import {
  getOverview,
  getRunReportById,
  getPersonaReport,
  getScenarioReport,
} from '../controllers/report.controller.js';

const router = Router();

router.get('/overview', getOverview);
router.get('/runs/:runId', getRunReportById);
router.get('/personas/:personaId', getPersonaReport);
router.get('/scenarios/:scenarioId', getScenarioReport);

export default router;
