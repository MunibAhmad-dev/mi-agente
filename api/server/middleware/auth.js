/**
 * API Key Authentication Middleware
 * ==================================
 * If API_KEY env var is set, all /api/ requests must include X-API-Key header.
 * If API_KEY is not set, all requests are allowed (development mode).
 */

function apiKeyAuth(req, res, next) {
  const requiredKey = process.env.API_KEY;

  // If no API key is configured, allow all requests (dev mode)
  if (!requiredKey) return next();

  // Skip auth for health check, API info, and metrics
  const url = req.originalUrl || req.path;
  if (url === '/health' || url === '/api' || url === '/api/' || url === '/metrics') return next();



  const providedKey = req.headers['x-api-key'] || req.query.api_key;

  if (!providedKey) {
    return res.status(401).json({
      error: 'API key required',
      message: 'Provide X-API-Key header or ?api_key= query parameter',
    });
  }

  if (providedKey !== requiredKey) {
    return res.status(403).json({
      error: 'Invalid API key',
      message: 'The provided API key is not valid',
    });
  }

  next();
}

module.exports = { apiKeyAuth };
