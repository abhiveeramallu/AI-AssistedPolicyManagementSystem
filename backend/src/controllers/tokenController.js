const EncryptedFile = require('../models/EncryptedFile');
const TokenLog = require('../models/TokenLog');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorMiddleware');
const {
  createAccessPasswordRecord,
  createFriendlyShareCode,
  issueFileAccessToken,
  verifyAccessPassword,
  verifyFileAccessToken,
  verifyFriendlyShareCode
} = require('../services/security/tokenService');
const { isPolicyExpired } = require('../services/security/accessControlService');
const { decryptMetadata } = require('../services/security/encryptionService');
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

const getValidatedTokenLogById = async ({ tokenId, password }) => {
  const tokenLog = await TokenLog.findById(tokenId);

  if (!tokenLog) {
    throw new AppError('Share reference is not recognized', 404);
  }

  if (tokenLog.expiresAt.getTime() < Date.now()) {
    tokenLog.status = 'expired';
    await tokenLog.save();
    throw new AppError('Share reference has expired', 401);
  }

  if (tokenLog.currentUsageCount >= tokenLog.maxUsageCount) {
    tokenLog.status = 'rejected';
    tokenLog.invalidReason = 'Maximum token usage count reached';
    await tokenLog.save();
    throw new AppError('Share reference usage limit reached', 403);
  }

  if (tokenLog.passwordHash) {
    if (!password) {
      throw new AppError('Access password is required for this share reference', 401);
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

  return tokenLog;
};

const getRemainingUses = (tokenLog) =>
  Math.max(0, Number(tokenLog.maxUsageCount || 0) - Number(tokenLog.currentUsageCount || 0));

const isTokenLogActive = (tokenLog) =>
  tokenLog.expiresAt?.getTime() > Date.now() && getRemainingUses(tokenLog) > 0;

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

  const tokenPermission = fileDoc.policy.permissionLevel;
  const policyControls =
    fileDoc.policy && typeof fileDoc.policy.recommendedControls === 'object'
      ? fileDoc.policy.recommendedControls
      : {
          requireTokenPassword: false,
          maxTokenTtlMinutes: 180,
          requireStrictAuditTrail: true
        };

  const remainingMinutes = Math.max(
    1,
    Math.floor((new Date(fileDoc.policy.expiresAt).getTime() - Date.now()) / 60000)
  );

  const normalizedAccessPassword = req.body.accessPassword?.trim();
  if (policyControls.requireTokenPassword && !normalizedAccessPassword) {
    throw new AppError(
      'This policy requires a secret password for generated share access',
      400
    );
  }

  const ttlCapMinutes = Number(policyControls.maxTokenTtlMinutes) || 180;
  const boundedExpiryMinutes = Math.min(req.body.expiryMinutes, remainingMinutes, ttlCapMinutes);
  const expiresAt = new Date(Date.now() + boundedExpiryMinutes * 60 * 1000);
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

  const shareCode = createFriendlyShareCode({
    tokenId: tokenLog.id,
    jti,
    fileId: fileDoc.id
  });
  const shareRef = `${tokenLog.id}:${shareCode}`;

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
    shareId: tokenLog.id,
    shareCode,
    shareRef,
    expiresAt,
    permissionLevel: tokenPermission,
    maxUsageCount: tokenLog.maxUsageCount,
    requiresPassword: Boolean(passwordRecord.passwordHash),
    policyControls
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

const resolveShareAccess = asyncHandler(async (req, res) => {
  const tokenId = String(req.body.tokenId || '').trim();
  const shareCode = req.body.shareCode;
  const password = req.body.password;

  const tokenLog = await getValidatedTokenLogById({ tokenId, password });

  const shareCodeValid = verifyFriendlyShareCode({
    providedCode: shareCode,
    tokenId: tokenLog.id,
    jti: tokenLog.jti,
    fileId: tokenLog.fileId
  });

  if (!shareCodeValid) {
    tokenLog.invalidReason = 'Invalid share code';
    tokenLog.lastValidatedAt = new Date();
    await tokenLog.save();
    throw new AppError('Invalid share code', 401);
  }

  const remainingSeconds = Math.max(
    30,
    Math.floor((tokenLog.expiresAt.getTime() - Date.now()) / 1000)
  );
  const temporaryTokenTtl = Math.min(300, remainingSeconds);

  const { token, decoded } = issueFileAccessToken({
    fileId: tokenLog.fileId,
    delegatedBy: tokenLog.issuedBy,
    permissionLevel: tokenLog.permissionLevel,
    expiresIn: `${temporaryTokenTtl}s`,
    maxUsageCount: tokenLog.maxUsageCount,
    jti: tokenLog.jti
  });

  tokenLog.status = 'validated';
  tokenLog.lastValidatedAt = new Date();
  await tokenLog.save();

  await writeAuditLog({
    actorId: 'public-share-resolver',
    action: 'token.share.resolve',
    entityType: 'TokenLog',
    entityId: tokenLog.id,
    outcome: 'success',
    details: {
      fileId: tokenLog.fileId,
      permissionLevel: tokenLog.permissionLevel
    }
  });

  return res.status(200).json({
    token,
    claims: {
      fileId: tokenLog.fileId,
      permissionLevel: tokenLog.permissionLevel,
      maxUsageCount: tokenLog.maxUsageCount,
      delegatedBy: tokenLog.issuedBy,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
      requiresPassword: Boolean(tokenLog.passwordHash)
    }
  });
});

const discoverOwnerSharedFiles = asyncHandler(async (req, res) => {
  const ownerId = String(req.body.ownerId || '').trim();
  const tokenLogs = await TokenLog.find({ issuedBy: ownerId }).sort({ createdAt: -1 }).limit(300);
  const seenFileIds = new Set();
  const files = [];

  for (const tokenLog of tokenLogs) {
    if (!isTokenLogActive(tokenLog)) {
      continue;
    }

    const fileId = String(tokenLog.fileId || '');
    if (!fileId || seenFileIds.has(fileId)) {
      continue;
    }

    const fileDoc = await EncryptedFile.findById(fileId);
    if (!fileDoc || isPolicyExpired(fileDoc.policy)) {
      continue;
    }

    const metadata = decryptMetadata(fileDoc.metadataEncrypted);
    seenFileIds.add(fileId);
    files.push({
      tokenId: tokenLog.id,
      fileId: fileDoc.id,
      fileName: metadata.originalName || fileDoc.id,
      mimeType: metadata.mimeType || 'application/octet-stream',
      permissionLevel: tokenLog.permissionLevel,
      expiresAt: tokenLog.expiresAt,
      requiresPassword: Boolean(tokenLog.passwordHash),
      remainingUses: getRemainingUses(tokenLog)
    });
  }

  await writeAuditLog({
    actorId: req.user.id,
    action: 'token.owner.discover',
    entityType: 'User',
    entityId: ownerId,
    outcome: 'success',
    details: {
      resultCount: files.length
    }
  });

  return res.status(200).json({
    ownerId,
    files
  });
});

const openOwnerSharedFile = asyncHandler(async (req, res) => {
  const ownerId = String(req.body.ownerId || '').trim();
  const tokenId = String(req.body.tokenId || '').trim();
  const password = req.body.password;
  const tokenLog = await TokenLog.findById(tokenId);

  if (!tokenLog || String(tokenLog.issuedBy) !== ownerId) {
    throw new AppError('No active shared file found for this owner and token reference', 404);
  }

  const validatedTokenLog = await getValidatedTokenLogById({ tokenId: tokenLog.id, password });

  if (String(validatedTokenLog.issuedBy) !== ownerId) {
    throw new AppError('No active shared file found for this owner and token reference', 404);
  }

  const fileDoc = await EncryptedFile.findById(validatedTokenLog.fileId);
  if (!fileDoc || isPolicyExpired(fileDoc.policy)) {
    throw new AppError('The shared file is no longer available', 404);
  }

  const remainingSeconds = Math.max(
    30,
    Math.floor((validatedTokenLog.expiresAt.getTime() - Date.now()) / 1000)
  );
  const temporaryTokenTtl = Math.min(300, remainingSeconds);

  const { token, decoded } = issueFileAccessToken({
    fileId: validatedTokenLog.fileId,
    delegatedBy: validatedTokenLog.issuedBy,
    permissionLevel: validatedTokenLog.permissionLevel,
    expiresIn: `${temporaryTokenTtl}s`,
    maxUsageCount: validatedTokenLog.maxUsageCount,
    jti: validatedTokenLog.jti
  });

  validatedTokenLog.status = 'validated';
  validatedTokenLog.lastValidatedAt = new Date();
  await validatedTokenLog.save();

  await writeAuditLog({
    actorId: req.user.id,
    action: 'token.owner.open',
    entityType: 'TokenLog',
    entityId: validatedTokenLog.id,
    outcome: 'success',
    details: {
      ownerId,
      fileId: validatedTokenLog.fileId,
      permissionLevel: validatedTokenLog.permissionLevel
    }
  });

  return res.status(200).json({
    token,
    claims: {
      fileId: validatedTokenLog.fileId,
      permissionLevel: validatedTokenLog.permissionLevel,
      maxUsageCount: validatedTokenLog.maxUsageCount,
      delegatedBy: validatedTokenLog.issuedBy,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
      requiresPassword: Boolean(validatedTokenLog.passwordHash)
    }
  });
});

module.exports = {
  generateToken,
  validateToken,
  validateSharedFileToken,
  resolveShareAccess,
  discoverOwnerSharedFiles,
  openOwnerSharedFile
};
