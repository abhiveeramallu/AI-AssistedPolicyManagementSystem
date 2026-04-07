const crypto = require('crypto');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorMiddleware');
const { issueDemoUserToken } = require('../services/security/tokenService');

const safeString = (value) => (typeof value === 'string' ? value : '');

const constantTimeEquals = (left, right) => {
  const leftBuffer = Buffer.from(safeString(left), 'utf8');
  const rightBuffer = Buffer.from(safeString(right), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const issueDevToken = asyncHandler(async (req, res) => {
  if (!env.enableDevAuthEndpoint) {
    throw new AppError('Dev token endpoint is disabled', 404);
  }

  const role = ['admin', 'editor', 'viewer'].includes(req.query.role) ? req.query.role : 'admin';
  const userId = req.query.userId || 'dev-user-1';
  const email = req.query.email || 'dev-user@example.com';

  const token = issueDemoUserToken({ userId, email, role });

  return res.status(200).json({
    token,
    user: {
      id: userId,
      email,
      role
    }
  });
});

const loginWithBootstrapCredentials = asyncHandler(async (req, res) => {
  if (!env.bootstrapLoginPassword) {
    throw new AppError('Bootstrap login is not configured on this server', 503);
  }

  const requestedEmail = safeString(req.body.email).trim().toLowerCase();
  const requestedPassword = safeString(req.body.password);
  const configuredEmail = safeString(env.bootstrapLoginEmail).trim().toLowerCase();
  const configuredPassword = safeString(env.bootstrapLoginPassword);

  const isEmailMatch = constantTimeEquals(requestedEmail, configuredEmail);
  const isPasswordMatch = constantTimeEquals(requestedPassword, configuredPassword);

  if (!isEmailMatch || !isPasswordMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  const role = ['admin', 'editor', 'viewer'].includes(env.bootstrapLoginRole)
    ? env.bootstrapLoginRole
    : 'admin';
  const userId = `bootstrap-${role}`;

  const token = issueDemoUserToken({
    userId,
    email: configuredEmail,
    role
  });

  return res.status(200).json({
    token,
    user: {
      id: userId,
      email: configuredEmail,
      role
    }
  });
});

module.exports = {
  issueDevToken,
  loginWithBootstrapCredentials
};
