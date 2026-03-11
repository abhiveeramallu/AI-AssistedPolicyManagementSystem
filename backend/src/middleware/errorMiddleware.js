const logger = require('../config/logger');

class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const notFoundHandler = (_req, _res, next) => {
  next(new AppError('Route not found', 404));
};

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error('Unhandled server error', {
      path: req.path,
      method: req.method,
      message: err.message,
      stack: err.stack
    });
  }

  return res.status(statusCode).json({
    error: {
      message: err.message || 'Unexpected server error',
      details: err.details || undefined
    }
  });
};

module.exports = {
  AppError,
  notFoundHandler,
  errorHandler
};
