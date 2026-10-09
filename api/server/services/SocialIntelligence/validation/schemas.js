/**
 * Input Validation Schemas
 * =========================
 * Lightweight validation for API inputs.
 * No external dependencies — uses plain JS validation functions.
 */

const { createLogger } = require('../logger');
const logger = createLogger('Validation');

/**
 * Validate search request body.
 */
function validateSearch(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }
  if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
    errors.push('query is required and must be a non-empty string');
  }
  if (body.query && body.query.length > 1000) {
    errors.push('query must be less than 1000 characters');
  }
  if (body.sources && !Array.isArray(body.sources)) {
    errors.push('sources must be an array');
  }
  if (body.sources && body.sources.length > 10) {
    errors.push('sources must have at most 10 entries');
  }
  if (body.maxResults && (typeof body.maxResults !== 'number' || body.maxResults < 1 || body.maxResults > 500)) {
    errors.push('maxResults must be a number between 1 and 500');
  }
  if (body.timeRange && !['today', '7d', '30d', '90d', '1y'].includes(body.timeRange)) {
    errors.push('timeRange must be one of: today, 7d, 30d, 90d, 1y');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate intent request body.
 */
function validateIntent(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }
  if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
    errors.push('query is required and must be a non-empty string');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate strategy request body.
 */
function validateStrategy(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }
  if (!body.objective || typeof body.objective !== 'string' || body.objective.trim().length === 0) {
    errors.push('objective is required and must be a non-empty string');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate campaign request body.
 */
function validateCampaign(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push('name is required and must be a non-empty string');
  }
  if (body.budget && typeof body.budget !== 'object') {
    errors.push('budget must be an object');
  }
  if (body.budget && body.budget.total && typeof body.budget.total !== 'number') {
    errors.push('budget.total must be a number');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate pipeline request body.
 */
function validatePipeline(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }
  if (!body.objective && !body.query) {
    errors.push('At least one of objective or query is required');
  }
  if (body.objective && typeof body.objective !== 'string') {
    errors.push('objective must be a string');
  }
  if (body.query && typeof body.query !== 'string') {
    errors.push('query must be a string');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Middleware: validate request body against a schema.
 */
function validate(schemaName) {
  const schemas = {
    search: validateSearch,
    intent: validateIntent,
    strategy: validateStrategy,
    campaign: validateCampaign,
    pipeline: validatePipeline,
  };

  const validator = schemas[schemaName];
  if (!validator) {
    throw new Error(`Unknown validation schema: ${schemaName}`);
  }

  return (req, res, next) => {
    const { valid, errors } = validator(req.body);
    if (!valid) {
      logger.warn('Validation failed', { schema: schemaName, errors });
      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }
    next();
  };
}

module.exports = {
  validateSearch,
  validateIntent,
  validateStrategy,
  validateCampaign,
  validatePipeline,
  validate,
};
