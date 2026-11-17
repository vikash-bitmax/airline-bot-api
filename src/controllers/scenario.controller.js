import Scenario from '../models/Scenario.model.js';

export const getScenarios = async (req, res, next) => {
  try {
    const { category, isActive, search } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { scenarioId: new RegExp(search, 'i') },
        { name: new RegExp(search, 'i') },
      ];
    }

    const scenarios = await Scenario.find(filter).sort({ scenarioId: 1 }).lean();
    return res.status(200).json({ success: true, count: scenarios.length, data: scenarios });
  } catch (err) {
    next(err);
  }
};

export const getScenarioById = async (req, res, next) => {
  try {
    const { scenarioId } = req.params;
    const scenario = await Scenario.findOne({ scenarioId }).lean();
    if (!scenario) {
      return res.status(404).json({ success: false, message: 'Scenario not found' });
    }
    return res.status(200).json({ success: true, data: scenario });
  } catch (err) {
    next(err);
  }
};

export const createScenario = async (req, res, next) => {
  try {
    const scenario = await Scenario.create(req.body);
    return res.status(201).json({ success: true, data: scenario });
  } catch (err) {
    next(err);
  }
};

export const updateScenario = async (req, res, next) => {
  try {
    const { scenarioId } = req.params;
    const scenario = await Scenario.findOneAndUpdate({ scenarioId }, req.body, { new: true });
    if (!scenario) {
      return res.status(404).json({ success: false, message: 'Scenario not found' });
    }
    return res.status(200).json({ success: true, data: scenario });
  } catch (err) {
    next(err);
  }
};

export const deleteScenario = async (req, res, next) => {
  try {
    const { scenarioId } = req.params;
    const scenario = await Scenario.findOneAndUpdate(
      { scenarioId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!scenario) {
      return res.status(404).json({ success: false, message: 'Scenario not found' });
    }
    return res.status(200).json({ success: true, message: 'Scenario deactivated successfully' });
  } catch (err) {
    next(err);
  }
};
