const express = require('express');
const { uploadMiddleware, uploadFile } = require('../controllers/uploadController');
const { authenticateUser, authorizeRoles } = require('../middleware/authMiddleware');
const { sensitiveRateLimiter } = require('../middleware/rateLimiterMiddleware');
const { validateRequest } = require('../middleware/validationMiddleware');
const { uploadSchema } = require('../validators/requestSchemas');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.post(
  '/upload',
  sensitiveRateLimiter,
  authenticateUser,
  authorizeRoles(ROLES.ADMIN, ROLES.EDITOR),
  uploadMiddleware.single('file'),
  validateRequest(uploadSchema),
  uploadFile
);

module.exports = router;
