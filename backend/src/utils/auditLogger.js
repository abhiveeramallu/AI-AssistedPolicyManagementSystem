const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

const redactSensitiveKeys = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;

  const sensitiveKeyPattern = /(token|secret|key|cipher|authTag|password)/i;
  const redacted = Array.isArray(payload) ? [] : {};

  Object.keys(payload).forEach((key) => {
    const value = payload[key];

    if (sensitiveKeyPattern.test(key)) {
      redacted[key] = '[REDACTED]';
      return;
    }

    if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveKeys(value);
      return;
    }

    redacted[key] = value;
  });

  return redacted;
};

const writeAuditLog = async ({ actorId, action, entityType, entityId, outcome, details }) => {
  try {
    await AuditLog.create({
      actorId,
      action,
      entityType,
      entityId,
      outcome,
      details: redactSensitiveKeys(details || {})
    });
  } catch (error) {
    logger.error('Failed to write audit log', { message: error.message });
  }
};

module.exports = { writeAuditLog, redactSensitiveKeys };
