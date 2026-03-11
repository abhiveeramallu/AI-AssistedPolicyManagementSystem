const multer = require('multer');
const env = require('../config/env');
const PolicyProposal = require('../models/PolicyProposal');
const EncryptedFile = require('../models/EncryptedFile');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorMiddleware');
const { validateUploadedFile } = require('../utils/fileValidation');
const {
  encryptFileBuffer,
  encryptMetadata,
  createChecksum,
  decryptMetadata
} = require('../services/security/encryptionService');
const { writeEncryptedFile } = require('../services/storage/secureStorageService');
const { writeAuditLog } = require('../utils/auditLogger');

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxFileSizeBytes
  }
});

const uploadFile = asyncHandler(async (req, res) => {
  const proposal = await PolicyProposal.findById(req.body.proposalId);

  if (!proposal) {
    throw new AppError('Approved policy is required before upload', 404);
  }

  if (proposal.status !== 'APPROVED' || !proposal.approvedPolicy) {
    throw new AppError('Policy must be approved before file can be uploaded', 409);
  }

  if (proposal.submittedBy !== req.user.id && req.user.role !== 'admin') {
    throw new AppError('You cannot use another user\'s policy proposal', 403);
  }

  const fileValidation = validateUploadedFile(req.file);
  const checksum = createChecksum(req.file.buffer);
  const { encryptedData, encryptionMetadata } = encryptFileBuffer(req.file.buffer);

  const metadataPayload = {
    originalName: req.file.originalname,
    uploadedBy: req.user.id,
    uploadedAt: new Date().toISOString(),
    mimeType: fileValidation.detectedMime,
    declaredMimeType: req.file.mimetype
  };

  const encryptedMetadata = encryptMetadata(metadataPayload);

  const expiresAt = new Date(Date.now() + proposal.approvedPolicy.expiryHours * 60 * 60 * 1000);

  const encryptedFile = await EncryptedFile.create({
    ownerId: req.user.id,
    proposalId: proposal.id,
    metadataEncrypted: encryptedMetadata,
    storagePath: 'pending',
    sizeBytes: req.file.size,
    checksumSha256: checksum,
    encryption: encryptionMetadata,
    policy: {
      permissionLevel: proposal.approvedPolicy.permissionLevel,
      expiresAt,
      encryptionRequired: true,
      maxAccessAttempts: proposal.approvedPolicy.maxAccessAttempts,
      riskExplanation: proposal.approvedPolicy.riskExplanation,
      riskScore: proposal.approvedPolicy.riskScore,
      riskLevel: proposal.approvedPolicy.riskLevel,
      riskSignals: proposal.approvedPolicy.riskSignals || [],
      decisionSummary: proposal.approvedPolicy.decisionSummary,
      reviewChecklist: proposal.approvedPolicy.reviewChecklist || [],
      uploadModuleRecommendations: proposal.approvedPolicy.uploadModuleRecommendations || [],
      guardrailsApplied: proposal.approvedPolicy.guardrailsApplied || [],
      engine: proposal.approvedPolicy.engine
    },
    accessMetrics: {
      attemptCount: 0,
      failedAttemptCount: 0
    }
  });

  const storagePath = await writeEncryptedFile(encryptedFile.id, encryptedData);
  encryptedFile.storagePath = storagePath;
  await encryptedFile.save();

  await writeAuditLog({
    actorId: req.user.id,
    action: 'file.upload',
    entityType: 'EncryptedFile',
    entityId: encryptedFile.id,
    outcome: 'success',
    details: {
      proposalId: proposal.id,
      permissionLevel: encryptedFile.policy.permissionLevel,
      expiresAt
    }
  });

  return res.status(201).json({
    id: encryptedFile.id,
    metadata: decryptMetadata(encryptedFile.metadataEncrypted),
    sizeBytes: encryptedFile.sizeBytes,
    policy: encryptedFile.policy,
    createdAt: encryptedFile.createdAt
  });
});

module.exports = {
  uploadMiddleware,
  uploadFile
};
