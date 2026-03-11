require('dotenv').config();
const { issueDemoUserToken } = require('../src/services/security/tokenService');

const role = process.argv[2] || 'admin';
const userId = process.argv[3] || 'demo-user-1';
const email = process.argv[4] || 'demo@example.com';

const token = issueDemoUserToken({ userId, email, role });

console.log(token);
