const express = require('express');
const { generatePolicy, approvePolicy } = require('../controllers/policyController');
const { authenticateUser, authorizeRoles } = require('../middleware/authMiddleware');
const { sensitiveRateLimiter } = require('../middleware/rateLimiterMiddleware');
const { validateRequest } = require('../middleware/validationMiddleware');
const { generatePolicySchema, approvePolicySchema } = require('../validators/requestSchemas');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.post(
  '/generate-policy',
  sensitiveRateLimiter,
  authenticateUser,
  authorizeRoles(ROLES.ADMIN, ROLES.EDITOR),
  validateRequest(generatePolicySchema),
  generatePolicy
);

router.post(
  '/approve-policy',
  sensitiveRateLimiter,
  authenticateUser,
  authorizeRoles(ROLES.ADMIN, ROLES.EDITOR),
  validateRequest(approvePolicySchema),
  approvePolicy
);

module.exports = router;
