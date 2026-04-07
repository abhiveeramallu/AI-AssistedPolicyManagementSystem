const express = require('express');
const {
  generateToken,
  validateToken,
  validateSharedFileToken,
  resolveShareAccess,
  discoverOwnerSharedFiles,
  openOwnerSharedFile
} = require('../controllers/tokenController');
const { authenticateUser, authorizeRoles } = require('../middleware/authMiddleware');
const { sensitiveRateLimiter } = require('../middleware/rateLimiterMiddleware');
const { validateRequest } = require('../middleware/validationMiddleware');
const {
  generateTokenSchema,
  resolveShareAccessSchema,
  validateTokenSchema,
  discoverOwnerSharedFilesSchema,
  openOwnerSharedFileSchema
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

router.post(
  '/discover-owner-files',
  sensitiveRateLimiter,
  authenticateUser,
  authorizeRoles(ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER),
  validateRequest(discoverOwnerSharedFilesSchema),
  discoverOwnerSharedFiles
);

router.post(
  '/open-owner-file',
  sensitiveRateLimiter,
  authenticateUser,
  authorizeRoles(ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER),
  validateRequest(openOwnerSharedFileSchema),
  openOwnerSharedFile
);

module.exports = router;
