const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AppError } = require('./errorMiddleware');

const getBearerToken = (headerValue) => {
  if (!headerValue || !headerValue.startsWith('Bearer ')) return null;
  return headerValue.slice(7).trim();
};

const authenticateUser = (req, _res, next) => {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    return next(new AppError('Missing Authorization bearer token', 401));
  }

  try {
    const payload = jwt.verify(token, env.accessJwtSecret);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || 'viewer'
    };
    return next();
  } catch (_error) {
    return next(new AppError('Invalid or expired authorization token', 401));
  }
};

const authenticateUserOrFileToken = (req, _res, next) => {
  const authHeaderToken = getBearerToken(req.headers.authorization);
  const sharedToken = req.headers['x-access-token'];

  if (authHeaderToken) {
    try {
      const payload = jwt.verify(authHeaderToken, env.accessJwtSecret);
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role || 'viewer'
      };
      return next();
    } catch (_error) {
      return next(new AppError('Invalid or expired authorization token', 401));
    }
  }

  if (sharedToken) {
    try {
      const payload = jwt.verify(sharedToken, env.fileTokenSecret);
      req.fileToken = payload;
      return next();
    } catch (_error) {
      return next(new AppError('Invalid or expired file access token', 401));
    }
  }

  return next(new AppError('Authentication required', 401));
};

const authorizeRoles = (...roles) => (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('User authentication is required', 401));
  }

  if (!roles.includes(req.user.role)) {
    return next(new AppError('Insufficient privileges for this operation', 403));
  }

  return next();
};

module.exports = {
  authenticateUser,
  authenticateUserOrFileToken,
  authorizeRoles
};
