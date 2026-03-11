const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorMiddleware');
const { issueDemoUserToken } = require('../services/security/tokenService');

const issueDevToken = asyncHandler(async (req, res) => {
  if (env.nodeEnv === 'production') {
    throw new AppError('Dev token endpoint is disabled in production', 404);
  }

  const role = ['admin', 'editor', 'viewer'].includes(req.query.role) ? req.query.role : 'admin';
  const userId = req.query.userId || 'dev-user-1';
  const email = req.query.email || 'dev-user@example.com';

  const token = issueDemoUserToken({ userId, email, role });

  return res.status(200).json({
    token,
    user: {
      id: userId,
      email,
      role
    }
  });
});

module.exports = {
  issueDevToken
};
