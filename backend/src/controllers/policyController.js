const PolicyProposal = require('../models/PolicyProposal');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorMiddleware');
const { encryptMetadata, decryptMetadata } = require('../services/security/encryptionService');
const { generatePolicyRecommendation } = require('../services/ai/policyEngineService');
const { writeAuditLog } = require('../utils/auditLogger');

const applyApprovalOverrides = (recommendedPolicy, overrides = {}) => {
  const proposedPermission = recommendedPolicy.permissionLevel;

  const approvedExpiryHours = Number(overrides.expiryHours) || recommendedPolicy.expiryHours;
  const approvedMaxAccessAttempts =
    Number(overrides.maxAccessAttempts) || recommendedPolicy.maxAccessAttempts;

  const hasOverride =
    approvedExpiryHours !== recommendedPolicy.expiryHours ||
    approvedMaxAccessAttempts !== recommendedPolicy.maxAccessAttempts;

  const decisionSummary = hasOverride
    ? `Approved with override: bounded access for ${approvedExpiryHours}h and ${approvedMaxAccessAttempts} max attempts.`
    : recommendedPolicy.decisionSummary ||
      `Approved as recommended: bounded access for ${approvedExpiryHours}h and ${approvedMaxAccessAttempts} max attempts.`;

  return {
    permissionLevel: proposedPermission,
    expiryHours: approvedExpiryHours,
    maxAccessAttempts: approvedMaxAccessAttempts,
    encryptionRequired: true,
    riskExplanation: recommendedPolicy.riskExplanation,
    confidence: recommendedPolicy.confidence,
    riskScore: recommendedPolicy.riskScore,
    riskLevel: recommendedPolicy.riskLevel,
    riskSignals: Array.isArray(recommendedPolicy.riskSignals) ? recommendedPolicy.riskSignals : [],
    decisionSummary,
    reviewChecklist: Array.isArray(recommendedPolicy.reviewChecklist)
      ? recommendedPolicy.reviewChecklist
      : [],
    recommendedControls:
      recommendedPolicy && typeof recommendedPolicy.recommendedControls === 'object'
        ? recommendedPolicy.recommendedControls
        : {
            requireTokenPassword: false,
            maxTokenTtlMinutes: 180,
            requireStrictAuditTrail: true
          },
    riskDrivers: Array.isArray(recommendedPolicy.riskDrivers)
      ? recommendedPolicy.riskDrivers
      : [],
    uploadModuleRecommendations: Array.isArray(recommendedPolicy.uploadModuleRecommendations)
      ? recommendedPolicy.uploadModuleRecommendations
      : [],
    guardrailsApplied: Array.isArray(recommendedPolicy.guardrailsApplied)
      ? recommendedPolicy.guardrailsApplied
      : [],
    engine: recommendedPolicy.engine || 'rule-fallback-v2'
  };
};

const generatePolicy = asyncHandler(async (req, res) => {
  const recommendation = await generatePolicyRecommendation(req.body);
  const encryptedContext = encryptMetadata(req.body);

  const proposal = await PolicyProposal.create({
    submittedBy: req.user.id,
    contextEncrypted: encryptedContext,
    contextSummary: {
      dataType: req.body.dataType,
      sensitivity: req.body.sensitivity
    },
    recommendation,
    status: 'PENDING'
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'policy.generate',
    entityType: 'PolicyProposal',
    entityId: proposal.id,
    outcome: 'success',
    details: {
      dataType: req.body.dataType,
      sensitivity: req.body.sensitivity,
      recommendedPermission: recommendation.permissionLevel
    }
  });

  return res.status(201).json({
    proposalId: proposal.id,
    status: proposal.status,
    recommendation,
    requiresHumanApproval: true
  });
});

const approvePolicy = asyncHandler(async (req, res) => {
  const proposal = await PolicyProposal.findById(req.body.proposalId);

  if (!proposal) {
    throw new AppError('Policy proposal not found', 404);
  }

  if (proposal.status !== 'PENDING') {
    throw new AppError('Policy proposal has already been reviewed', 409);
  }

  if (!req.body.approved) {
    proposal.status = 'REJECTED';
    proposal.approvedBy = req.user.id;
    proposal.approvedAt = new Date();
    proposal.approvalNote = (req.body.approvalNote || '').trim();
    await proposal.save();

    await writeAuditLog({
      actorId: req.user.id,
      action: 'policy.reject',
      entityType: 'PolicyProposal',
      entityId: proposal.id,
      outcome: 'success',
      details: {
        recommendationPermission: proposal.recommendation.permissionLevel
      }
    });

    return res.status(200).json({
      proposalId: proposal.id,
      status: proposal.status
    });
  }

  if (req.body.overrides) {
    const approvalNote = (req.body.approvalNote || '').trim();
    if (approvalNote.length < 12) {
      throw new AppError(
        'Approval note (minimum 12 characters) is required when overriding AI recommendation',
        400
      );
    }
  }

  const approvedPolicy = applyApprovalOverrides(
    proposal.recommendation,
    req.body.overrides
  );

  proposal.status = 'APPROVED';
  proposal.approvedPolicy = approvedPolicy;
  proposal.approvedBy = req.user.id;
  proposal.approvedAt = new Date();
  proposal.approvalNote = (req.body.approvalNote || '').trim();
  await proposal.save();

  await writeAuditLog({
    actorId: req.user.id,
    action: 'policy.approve',
    entityType: 'PolicyProposal',
    entityId: proposal.id,
    outcome: 'success',
    details: {
      approvedPermission: approvedPolicy.permissionLevel,
      expiryHours: approvedPolicy.expiryHours,
      approvalNote: proposal.approvalNote
    }
  });

  return res.status(200).json({
    proposalId: proposal.id,
    status: proposal.status,
    approvedPolicy,
    approvalNote: proposal.approvalNote || '',
    encryptedContext: decryptMetadata(proposal.contextEncrypted)
  });
});

module.exports = {
  generatePolicy,
  approvePolicy
};
