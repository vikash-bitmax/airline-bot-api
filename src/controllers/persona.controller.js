import Persona from '../models/Persona.model.js';

export const getPersonas = async (req, res, next) => {
  try {
    const { category, isActive, search } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { personaId: new RegExp(search, 'i') },
        { name: new RegExp(search, 'i') },
      ];
    }

    const personas = await Persona.find(filter).sort({ personaId: 1 }).lean();
    return res.status(200).json({ success: true, count: personas.length, data: personas });
  } catch (err) {
    next(err);
  }
};

export const getPersonaById = async (req, res, next) => {
  try {
    const { personaId } = req.params;
    const persona = await Persona.findOne({ personaId }).lean();
    if (!persona) {
      return res.status(404).json({ success: false, message: 'Persona not found' });
    }
    return res.status(200).json({ success: true, data: persona });
  } catch (err) {
    next(err);
  }
};

export const createPersona = async (req, res, next) => {
  try {
    const persona = await Persona.create(req.body);
    return res.status(201).json({ success: true, data: persona });
  } catch (err) {
    next(err);
  }
};

export const updatePersona = async (req, res, next) => {
  try {
    const { personaId } = req.params;
    const persona = await Persona.findOneAndUpdate({ personaId }, req.body, { new: true });
    if (!persona) {
      return res.status(404).json({ success: false, message: 'Persona not found' });
    }
    return res.status(200).json({ success: true, data: persona });
  } catch (err) {
    next(err);
  }
};

export const deletePersona = async (req, res, next) => {
  try {
    const { personaId } = req.params;
    // Soft delete
    const persona = await Persona.findOneAndUpdate(
      { personaId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!persona) {
      return res.status(404).json({ success: false, message: 'Persona not found' });
    }
    return res.status(200).json({ success: true, message: 'Persona deactivated successfully' });
  } catch (err) {
    next(err);
  }
};
