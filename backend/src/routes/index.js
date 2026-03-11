const express = require('express');
const authRoutes = require('./authRoutes');
const uploadRoutes = require('./uploadRoutes');
const policyRoutes = require('./policyRoutes');
const fileRoutes = require('./fileRoutes');
const tokenRoutes = require('./tokenRoutes');

const router = express.Router();

router.use(authRoutes);
router.use(uploadRoutes);
router.use(policyRoutes);
router.use(fileRoutes);
router.use(tokenRoutes);

module.exports = router;
