const crypto = require('crypto');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorMiddleware');
const { issueDemoUserToken } = require('../services/security/tokenService');
const { hashPassword, verifyPassword } = require('../services/security/passwordService');
const { ROLES } = require('../constants/roles');
const User = require('../models/User');
const { writeAuditLog } = require('../utils/auditLogger');

const safeString = (value) => (typeof value === 'string' ? value : '');
const normalizeEmail = (value) => safeString(value).trim().toLowerCase();

const constantTimeEquals = (left, right) => {
  const leftBuffer = Buffer.from(safeString(left), 'utf8');
  const rightBuffer = Buffer.from(safeString(right), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const getAllowedSelfRegistrationRole = (requestedRole) => {
  const normalizedRole = safeString(requestedRole).trim().toLowerCase();
  if (normalizedRole === ROLES.VIEWER || normalizedRole === ROLES.EDITOR) {
    return normalizedRole;
  }
  return ROLES.EDITOR;
};

const issueDevToken = asyncHandler(async (req, res) => {
  if (!env.enableDevAuthEndpoint) {
    throw new AppError('Dev token endpoint is disabled', 404);
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

const registerUser = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = safeString(req.body.password);
  const name = safeString(req.body.name).trim();
  const role = getAllowedSelfRegistrationRole(req.body.role);

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordRecord = hashPassword(password);
  const user = await User.create({
    email,
    name: name || undefined,
    role,
    status: 'active',
    authProvider: 'local',
    passwordHash: passwordRecord.passwordHash,
    passwordSalt: passwordRecord.passwordSalt
  });

  const token = issueDemoUserToken({
    userId: user.id,
    email: user.email,
    role: user.role
  });

  await writeAuditLog({
    actorId: user.id,
    action: 'auth.register',
    entityType: 'User',
    entityId: user.id,
    outcome: 'success',
    details: {
      role: user.role,
      authProvider: user.authProvider
    }
  });

  return res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name || ''
    }
  });
});

const login = asyncHandler(async (req, res) => {
  const requestedEmail = normalizeEmail(req.body.email);
  const requestedPassword = safeString(req.body.password);

  const localUser = await User.findOne({ email: requestedEmail });
  if (localUser) {
    if (localUser.status !== 'active') {
      throw new AppError('User account is inactive', 403);
    }

    const passwordValid = verifyPassword({
      password: requestedPassword,
      passwordSalt: localUser.passwordSalt,
      passwordHash: localUser.passwordHash
    });

    if (!passwordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = issueDemoUserToken({
      userId: localUser.id,
      email: localUser.email,
      role: localUser.role || ROLES.VIEWER
    });

    await writeAuditLog({
      actorId: localUser.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: localUser.id,
      outcome: 'success',
      details: {
        role: localUser.role || ROLES.VIEWER,
        authProvider: 'local'
      }
    });

    return res.status(200).json({
      token,
      user: {
        id: localUser.id,
        email: localUser.email,
        role: localUser.role || ROLES.VIEWER,
        name: localUser.name || ''
      }
    });
  }

  if (!env.bootstrapLoginPassword) {
    throw new AppError('Invalid email or password', 401);
  }

  const configuredEmail = normalizeEmail(env.bootstrapLoginEmail);
  const configuredPassword = safeString(env.bootstrapLoginPassword);

  const isEmailMatch = constantTimeEquals(requestedEmail, configuredEmail);
  const isPasswordMatch = constantTimeEquals(requestedPassword, configuredPassword);

  if (!isEmailMatch || !isPasswordMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  const role = ['admin', 'editor', 'viewer'].includes(env.bootstrapLoginRole)
    ? env.bootstrapLoginRole
    : 'admin';
  const userId = `bootstrap-${role}`;

  const token = issueDemoUserToken({
    userId,
    email: configuredEmail,
    role
  });

  return res.status(200).json({
    token,
    user: {
      id: userId,
      email: configuredEmail,
      role,
      name: 'Bootstrap Admin'
    }
  });
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const persistedUser = await User.findById(req.user.id);

  return res.status(200).json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role || ROLES.VIEWER,
      name: persistedUser?.name || ''
    }
  });
});

module.exports = {
  issueDevToken,
  registerUser,
  login,
  getCurrentUser
};
