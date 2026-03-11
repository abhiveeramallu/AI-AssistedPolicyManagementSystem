const rateLimit = require('express-rate-limit');

const standardRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests, please retry shortly'
    }
  }
});

const sensitiveRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Rate limit reached for sensitive endpoint'
    }
  }
});

module.exports = {
  standardRateLimiter,
  sensitiveRateLimiter
};
