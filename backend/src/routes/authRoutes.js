const express = require('express');
const { issueDevToken, registerUser, login, getCurrentUser } = require('../controllers/authController');
const { sensitiveRateLimiter } = require('../middleware/rateLimiterMiddleware');
const { validateRequest } = require('../middleware/validationMiddleware');
const { authLoginSchema, authRegisterSchema } = require('../validators/requestSchemas');
const { authenticateUser } = require('../middleware/authMiddleware');

const router = express.Router();

router.post(
  '/auth/register',
  sensitiveRateLimiter,
  validateRequest(authRegisterSchema),
  registerUser
);
router.post(
  '/auth/login',
  sensitiveRateLimiter,
  validateRequest(authLoginSchema),
  login
);
router.get('/auth/dev-token', sensitiveRateLimiter, issueDevToken);
router.get('/auth/me', sensitiveRateLimiter, authenticateUser, getCurrentUser);

module.exports = router;
