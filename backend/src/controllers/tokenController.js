const EncryptedFile = require('../models/EncryptedFile');
const TokenLog = require('../models/TokenLog');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorMiddleware');
const {
  createAccessPasswordRecord,
  issueFileAccessToken,
  verifyAccessPassword,
  verifyFileAccessToken
} = require('../services/security/tokenService');
const { isPolicyExpired } = require('../services/security/accessControlService');
const { writeAuditLog } = require('../utils/auditLogger');

const performTokenValidation = async ({ token, actorId = 'validator', password }) => {
  const payload = verifyFileAccessToken(token);
  const tokenLog = await TokenLog.findOne({ jti: payload.jti });

  if (!tokenLog) {
    throw new AppError('Token is not recognized', 404);
  }

  if (tokenLog.expiresAt.getTime() < Date.now()) {
    tokenLog.status = 'expired';
    await tokenLog.save();
    throw new AppError('Token has expired', 401);
  }

  if (tokenLog.passwordHash) {
    if (!password) {
      throw new AppError('Access password is required for this token', 401);
    }

    const passwordValid = verifyAccessPassword({
      password,
      passwordSalt: tokenLog.passwordSalt,
      passwordHash: tokenLog.passwordHash
    });

    if (!passwordValid) {
      tokenLog.invalidReason = 'Invalid access password';
      tokenLog.lastValidatedAt = new Date();
      await tokenLog.save();
      throw new AppError('Invalid access password', 401);
    }
  }

  tokenLog.status = 'validated';
  tokenLog.lastValidatedAt = new Date();
  await tokenLog.save();

  await writeAuditLog({
    actorId,
    action: 'token.validate',
    entityType: 'TokenLog',
    entityId: tokenLog.id,
    outcome: 'success',
    details: {
      fileId: payload.fileId,
      permissionLevel: payload.permissionLevel
    }
  });

  return {
    valid: true,
    claims: {
      fileId: payload.fileId,
      permissionLevel: payload.permissionLevel,
      maxUsageCount: payload.maxUsageCount,
      delegatedBy: payload.delegatedBy,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      requiresPassword: Boolean(tokenLog.passwordHash)
    }
  };
};

const generateToken = asyncHandler(async (req, res) => {
  const fileDoc = await EncryptedFile.findById(req.body.fileId);

  if (!fileDoc) {
    throw new AppError('Encrypted file not found', 404);
  }

  if (isPolicyExpired(fileDoc.policy)) {
    throw new AppError('Cannot issue token for expired policy', 409);
  }

  if (req.user.role !== 'admin' && String(fileDoc.ownerId) !== String(req.user.id)) {
    throw new AppError('Only owner or admin can generate file token', 403);
  }

  if (
    req.body.permissionLevel &&
    req.body.permissionLevel !== fileDoc.policy.permissionLevel
  ) {
    throw new AppError(
      `Token permission must match approved file policy permission (${fileDoc.policy.permissionLevel})`,
      403
    );
  }

  const tokenPermission = fileDoc.policy.permissionLevel;

  const remainingMinutes = Math.max(
    1,
    Math.floor((new Date(fileDoc.policy.expiresAt).getTime() - Date.now()) / 60000)
  );

  const boundedExpiryMinutes = Math.min(req.body.expiryMinutes, remainingMinutes);
  const expiresAt = new Date(Date.now() + boundedExpiryMinutes * 60 * 1000);
  const normalizedAccessPassword = req.body.accessPassword?.trim();
  const passwordRecord = normalizedAccessPassword
    ? createAccessPasswordRecord(normalizedAccessPassword)
    : {};

  const { token, jti, tokenHash } = issueFileAccessToken({
    fileId: fileDoc.id,
    delegatedBy: req.user.id,
    permissionLevel: tokenPermission,
    expiresIn: `${boundedExpiryMinutes}m`,
    maxUsageCount: req.body.maxUsageCount || fileDoc.policy.maxAccessAttempts
  });

  const tokenLog = await TokenLog.create({
    jti,
    fileId: fileDoc.id,
    issuedBy: req.user.id,
    permissionLevel: tokenPermission,
    tokenHash,
    expiresAt,
    maxUsageCount: req.body.maxUsageCount || fileDoc.policy.maxAccessAttempts,
    currentUsageCount: 0,
    status: 'issued',
    passwordHash: passwordRecord.passwordHash,
    passwordSalt: passwordRecord.passwordSalt,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'token.generate',
    entityType: 'TokenLog',
    entityId: tokenLog.id,
    outcome: 'success',
    details: {
      fileId: fileDoc.id,
      permissionLevel: tokenPermission,
      expiresAt,
      passwordProtected: Boolean(passwordRecord.passwordHash)
    }
  });

  return res.status(201).json({
    token,
    tokenId: tokenLog.id,
    expiresAt,
    permissionLevel: tokenPermission,
    maxUsageCount: tokenLog.maxUsageCount,
    requiresPassword: Boolean(passwordRecord.passwordHash)
  });
});

const validateToken = asyncHandler(async (req, res) => {
  try {
    const validationResult = await performTokenValidation({
      token: req.body.token,
      actorId: req.user?.id || 'validator',
      password: req.body.password
    });
    return res.status(200).json(validationResult);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        valid: false,
        error: {
          message: 'Invalid or expired token'
        }
      });
    }

    throw error;
  }
});

const validateSharedFileToken = asyncHandler(async (req, res) => {
  try {
    const validationResult = await performTokenValidation({
      token: req.body.token,
      actorId: 'public-validator',
      password: req.body.password
    });
    return res.status(200).json(validationResult);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        valid: false,
        error: {
          message: 'Invalid or expired token'
        }
      });
    }

    throw error;
  }
});

module.exports = {
  generateToken,
  validateToken,
  validateSharedFileToken
};
