const EncryptedFile = require('../models/EncryptedFile');
const TokenLog = require('../models/TokenLog');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorMiddleware');
const {
  decryptMetadata,
  decryptFileBuffer
} = require('../services/security/encryptionService');
const {
  readEncryptedFile,
  deleteEncryptedFile
} = require('../services/storage/secureStorageService');
const {
  DOCX_MIME_TYPE,
  convertDocxBufferToHtml
} = require('../services/storage/documentPreviewService');
const {
  isPolicyExpired,
  hasExceededAttempts,
  isPermissionAtLeast
} = require('../services/security/accessControlService');
const { verifyAccessPassword } = require('../services/security/tokenService');
const { writeAuditLog } = require('../utils/auditLogger');

const mapFileForListResponse = (fileDoc) => ({
  id: fileDoc.id,
  ownerId: fileDoc.ownerId,
  metadata: decryptMetadata(fileDoc.metadataEncrypted),
  sizeBytes: fileDoc.sizeBytes,
  policy: fileDoc.policy,
  accessMetrics: fileDoc.accessMetrics,
  createdAt: fileDoc.createdAt,
  updatedAt: fileDoc.updatedAt
});

const listFiles = asyncHandler(async (req, res) => {
  const query = req.user.role === 'admin' ? {} : { ownerId: req.user.id };
  const files = await EncryptedFile.find(query).sort({ createdAt: -1 }).limit(200);

  return res.status(200).json({
    files: files.map(mapFileForListResponse)
  });
});

const registerFailedAttempt = async (fileDoc) => {
  fileDoc.accessMetrics.failedAttemptCount += 1;
  await fileDoc.save();
};

const resolveTokenLogForFileAccess = async (fileDoc, fileToken, accessPassword) => {
  if (!fileToken || fileToken.type !== 'file_access') {
    throw new AppError('Invalid file access token', 401);
  }

  if (String(fileToken.fileId) !== String(fileDoc.id)) {
    throw new AppError('File token does not match requested file', 403);
  }

  const tokenLog = await TokenLog.findOne({
    jti: fileToken.jti,
    fileId: fileDoc.id
  });

  if (!tokenLog) {
    throw new AppError('Token is not registered in audit logs', 401);
  }

  if (tokenLog.expiresAt.getTime() < Date.now()) {
    tokenLog.status = 'expired';
    await tokenLog.save();
    throw new AppError('File token has expired', 401);
  }

  if (tokenLog.currentUsageCount >= tokenLog.maxUsageCount) {
    tokenLog.status = 'rejected';
    tokenLog.invalidReason = 'Maximum token usage count reached';
    await tokenLog.save();
    throw new AppError('File token usage limit reached', 403);
  }

  if (tokenLog.passwordHash) {
    if (!accessPassword) {
      throw new AppError('Access password is required for this token', 401);
    }

    const passwordValid = verifyAccessPassword({
      password: accessPassword,
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

const authorizeDirectUserAccess = (fileDoc, reqUser) => {
  if (!reqUser) {
    throw new AppError('Authentication is required to access this file', 401);
  }

  if (reqUser.role === 'admin') {
    return;
  }

  if (String(fileDoc.ownerId) !== String(reqUser.id)) {
    throw new AppError('You are not allowed to access this file', 403);
  }
};

const getFileById = asyncHandler(async (req, res) => {
  const fileDoc = await EncryptedFile.findById(req.params.id);

  if (!fileDoc) {
    throw new AppError('Encrypted file not found', 404);
  }

  if (isPolicyExpired(fileDoc.policy)) {
    await registerFailedAttempt(fileDoc);
    throw new AppError('File access policy has expired', 403);
  }

  if (hasExceededAttempts(fileDoc)) {
    await registerFailedAttempt(fileDoc);
    throw new AppError('Maximum access attempts exceeded for this file', 403);
  }

  const previewRequested = req.query?.preview === 'true' || req.query?.preview === '1';
  let tokenLog;

  if (req.fileToken) {
    tokenLog = await resolveTokenLogForFileAccess(
      fileDoc,
      req.fileToken,
      req.headers['x-access-password']
    );

    if (!isPermissionAtLeast(req.fileToken.permissionLevel, 'view')) {
      throw new AppError('File token does not allow viewing this file', 403);
    }

    if (req.fileToken.permissionLevel === 'view' && !previewRequested) {
      throw new AppError('View-only token permits preview access only', 403);
    }

    if (req.fileToken.permissionLevel === 'edit' && previewRequested) {
      throw new AppError('Edit token permits download access only', 403);
    }
  } else {
    authorizeDirectUserAccess(fileDoc, req.user);

    if (!isPermissionAtLeast(fileDoc.policy.permissionLevel, 'view')) {
      throw new AppError('Policy does not permit viewing this file', 403);
    }
  }

  const { encryptedBuffer } = await readEncryptedFile(fileDoc.id);
  const plaintext = decryptFileBuffer(encryptedBuffer, fileDoc.encryption);
  const metadata = decryptMetadata(fileDoc.metadataEncrypted);

  fileDoc.accessMetrics.attemptCount += 1;
  fileDoc.accessMetrics.lastAccessAt = new Date();
  await fileDoc.save();

  if (tokenLog) {
    tokenLog.currentUsageCount += 1;
    tokenLog.status = 'validated';
    tokenLog.lastValidatedAt = new Date();
    await tokenLog.save();
  }

  await writeAuditLog({
    actorId: req.user?.id || req.fileToken?.delegatedBy || 'token-user',
    action: 'file.read',
    entityType: 'EncryptedFile',
    entityId: fileDoc.id,
    outcome: 'success',
    details: {
      usedSharedToken: Boolean(req.fileToken),
      permissionLevel: req.fileToken?.permissionLevel || fileDoc.policy.permissionLevel
    }
  });

  if (previewRequested) {
    if (metadata.mimeType === DOCX_MIME_TYPE) {
      try {
        const htmlPreview = await convertDocxBufferToHtml(plaintext);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${metadata.originalName || fileDoc.id}"`
        );
        return res.status(200).send(htmlPreview);
      } catch (error) {
        throw new AppError(`Preview conversion failed: ${error.message}`, 422);
      }
    }

    if (
      metadata.mimeType === 'application/pdf' ||
      metadata.mimeType?.startsWith('image/') ||
      metadata.mimeType?.startsWith('text/')
    ) {
      res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${metadata.originalName || fileDoc.id}"`
      );
      return res.status(200).send(plaintext);
    }

    throw new AppError('Preview is unavailable for this file type', 415);
  }

  res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName || fileDoc.id}"`);
  return res.status(200).send(plaintext);
});

const deleteFileById = asyncHandler(async (req, res) => {
  const fileDoc = await EncryptedFile.findById(req.params.id);

  if (!fileDoc) {
    throw new AppError('Encrypted file not found', 404);
  }

  if (req.user.role !== 'admin') {
    throw new AppError('Only admin can delete encrypted files', 403);
  }

  await deleteEncryptedFile(fileDoc.id);
  await EncryptedFile.deleteOne({ _id: fileDoc.id });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'file.delete',
    entityType: 'EncryptedFile',
    entityId: fileDoc.id,
    outcome: 'success',
    details: {
      ownerId: fileDoc.ownerId
    }
  });

  return res.status(200).json({ message: 'File deleted successfully' });
});

module.exports = {
  listFiles,
  getFileById,
  deleteFileById
};
