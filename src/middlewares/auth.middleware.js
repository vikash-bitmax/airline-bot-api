import { env } from '../config/environment.js';

export const apiAuth = (req, res, next) => {
  // If no CRM_SERVICE_TOKEN or API secret configured, allow local dev
  const requiredToken = process.env.SIMULATOR_API_KEY;
  if (!requiredToken || env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${requiredToken}`) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing API key',
    });
  }

  next();
};
