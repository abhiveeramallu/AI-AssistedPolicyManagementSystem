const express = require('express');
const { issueDevToken } = require('../controllers/authController');
const { sensitiveRateLimiter } = require('../middleware/rateLimiterMiddleware');

const router = express.Router();

router.get('/auth/dev-token', sensitiveRateLimiter, issueDevToken);

module.exports = router;
