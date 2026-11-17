import { Router } from 'express';
import {
  getPersonas,
  getPersonaById,
  createPersona,
  updatePersona,
  deletePersona,
} from '../controllers/persona.controller.js';

const router = Router();

router.get('/', getPersonas);
router.get('/:personaId', getPersonaById);
router.post('/', createPersona);
router.patch('/:personaId', updatePersona);
router.delete('/:personaId', deletePersona);

export default router;
