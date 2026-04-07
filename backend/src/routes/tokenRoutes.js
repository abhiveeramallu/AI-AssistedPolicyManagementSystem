const express = require('express');
const {
  generateToken,
  validateToken,
  validateSharedFileToken,
  resolveShareAccess
} = require('../controllers/tokenController');
const { authenticateUser, authorizeRoles } = require('../middleware/authMiddleware');
const { sensitiveRateLimiter } = require('../middleware/rateLimiterMiddleware');
const { validateRequest } = require('../middleware/validationMiddleware');
const {
  generateTokenSchema,
  resolveShareAccessSchema,
  validateTokenSchema
} = require('../validators/requestSchemas');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.post(
  '/generate-token',
  sensitiveRateLimiter,
  authenticateUser,
  authorizeRoles(ROLES.ADMIN, ROLES.EDITOR),
  validateRequest(generateTokenSchema),
  generateToken
);

router.post(
  '/validate-token',
  sensitiveRateLimiter,
  authenticateUser,
  authorizeRoles(ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER),
  validateRequest(validateTokenSchema),
  validateToken
);

router.post(
  '/validate-file-token',
  sensitiveRateLimiter,
  validateRequest(validateTokenSchema),
  validateSharedFileToken
);

router.post(
  '/resolve-share-access',
  sensitiveRateLimiter,
  validateRequest(resolveShareAccessSchema),
  resolveShareAccess
);

module.exports = router;
