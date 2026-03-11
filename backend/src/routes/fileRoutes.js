const express = require('express');
const { listFiles, getFileById, deleteFileById } = require('../controllers/fileController');
const {
  authenticateUser,
  authenticateUserOrFileToken,
  authorizeRoles
} = require('../middleware/authMiddleware');
const { sensitiveRateLimiter } = require('../middleware/rateLimiterMiddleware');
const { validateRequest } = require('../middleware/validationMiddleware');
const { fileIdParamSchema } = require('../validators/requestSchemas');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.get('/files', authenticateUser, authorizeRoles(ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER), listFiles);

router.get(
  '/file/:id',
  sensitiveRateLimiter,
  authenticateUserOrFileToken,
  validateRequest(fileIdParamSchema),
  getFileById
);

router.delete(
  '/file/:id',
  sensitiveRateLimiter,
  authenticateUser,
  authorizeRoles(ROLES.ADMIN),
  validateRequest(fileIdParamSchema),
  deleteFileById
);

module.exports = router;
