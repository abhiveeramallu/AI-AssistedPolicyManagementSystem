const express = require('express');
const { issueDevToken, loginWithBootstrapCredentials } = require('../controllers/authController');
const { sensitiveRateLimiter } = require('../middleware/rateLimiterMiddleware');
const { validateRequest } = require('../middleware/validationMiddleware');
const { authLoginSchema } = require('../validators/requestSchemas');

const router = express.Router();

router.post(
  '/auth/login',
  sensitiveRateLimiter,
  validateRequest(authLoginSchema),
  loginWithBootstrapCredentials
);
router.get('/auth/dev-token', sensitiveRateLimiter, issueDevToken);

module.exports = router;
