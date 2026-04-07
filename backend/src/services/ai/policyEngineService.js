const { buildPolicyPrompt } = require('./promptTemplate');
const { requestPolicyRecommendation } = require('./openAIService');

const clampNumber = (value, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const normalizePermission = (permission, fallback = 'view') => {
  if (permission === 'edit' || permission === 'view') return permission;
  return fallback;
};

const PERMISSION_ORDER = { view: 0, edit: 1 };

const toPermissionFloor = (permission) => (permission === 'edit' ? 'edit' : 'view');

const clipToPermissionFloor = (candidatePermission, permissionFloor) =>
  PERMISSION_ORDER[candidatePermission] > PERMISSION_ORDER[permissionFloor]
    ? permissionFloor
    : candidatePermission;

const classifyRiskLevel = (score) => {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
};

const buildUploadModuleRecommendations = ({ riskLevel, externalSharing, largeFile }) => {
  const baseline = [
    'Enforce staged upload checks: type signature, size, policy approval, then encryption.',
    'Block file extension and MIME mismatch before upload acceptance.',
    'Show upload policy impact preview (permission/expiry/attempts) before final submit.'
  ];

  if (riskLevel === 'critical') {
    return [
      'Require dual approver sign-off for critical uploads before storage.',
      'Force strict MIME allow-list and quarantine uncommon signatures for review.',
      'Limit critical uploads to short-lived policy windows and minimal retry attempts.'
    ];
  }

  if (riskLevel === 'high') {
    return [
      'Require owner attestation and business reason confirmation for high-risk uploads.',
      'Apply stricter file type controls with signature verification and mismatch blocking.',
      'Reduce upload retry path and trigger audit review after failed validation attempts.'
    ];
  }

  if (externalSharing || largeFile) {
    return [
      'Warn users when upload purpose implies external sharing and require explicit confirmation.',
      'Force duplicate detection and checksum confirmation before accepting large uploads.',
      'Require temporary access windows for externally shared or oversized files.'
    ];
  }

  return baseline;
};

const deriveRecommendedControls = ({ riskLevel, externalSharing, largeFile }) => {
  const controlByRisk = {
    low: { requireTokenPassword: false, maxTokenTtlMinutes: 360 },
    medium: { requireTokenPassword: false, maxTokenTtlMinutes: 180 },
    high: { requireTokenPassword: true, maxTokenTtlMinutes: 60 },
    critical: { requireTokenPassword: true, maxTokenTtlMinutes: 30 }
  };

  const baseline = controlByRisk[riskLevel] || controlByRisk.medium;

  return {
    requireTokenPassword: baseline.requireTokenPassword || externalSharing,
    maxTokenTtlMinutes: largeFile ? Math.min(baseline.maxTokenTtlMinutes, 90) : baseline.maxTokenTtlMinutes,
    requireStrictAuditTrail: true
  };
};

const buildReviewChecklist = ({ riskLevel, externalSharing }) => {
  return [
    'Confirm recommended access mode is the minimum needed for this purpose.',
    `Verify expiry is short enough for ${riskLevel.toUpperCase()} risk handling.`,
    externalSharing
      ? 'Validate recipient scope and sharing channel are approved for external access.'
      : 'Validate recipient scope is limited to approved internal users only.'
  ];
};

const buildDeterministicRecommendation = (context, engine = 'rule-baseline-v2') => {
  const requestedDuration = clampNumber(context.durationHours, 1, 24 * 90);
  const requestedAttempts = clampNumber(context.maxAccessAttempts || 5, 1, 20);
  const purpose = (context.purpose || '').toLowerCase();
  const dataType = (context.dataType || '').toLowerCase();
  const sensitivity = (context.sensitivity || 'low').toLowerCase();
  const fileSizeBytes = Number(context.fileSize) || 0;
  const fileSizeMb = fileSizeBytes / (1024 * 1024);

  const collaborativePurpose = /(collaborat|update|edit|draft|review|co-author|sync)/.test(purpose);
  const externalSharing = /(external|vendor|partner|third[- ]party|public|outside|client|email)/.test(purpose);
  const shortLivedPurpose = /(temporary|one[- ]time|urgent|incident|today|short)/.test(purpose);
  const largeFile = fileSizeMb >= 8;

  const sensitivityScoreMap = { low: 18, medium: 36, high: 56, critical: 74 };
  const dataTypeScoreMap = {
    'customer-data': 8,
    financial: 11,
    healthcare: 12,
    'source-code': 10,
    legal: 9,
    'internal-doc': 5,
    other: 4
  };

  const signals = [];
  const riskDrivers = [];
  const pushSignal = (message) => {
    if (!signals.includes(message) && signals.length < 6) signals.push(message);
  };
  const pushDriver = (factor, impact, detail) => {
    riskDrivers.push({
      factor,
      impact,
      detail
    });
  };

  let riskScore = sensitivityScoreMap[sensitivity] ?? sensitivityScoreMap.low;
  riskScore += dataTypeScoreMap[dataType] ?? dataTypeScoreMap.other;
  pushDriver(
    'Sensitivity',
    sensitivityScoreMap[sensitivity] ?? sensitivityScoreMap.low,
    `Sensitivity ${sensitivity.toUpperCase()} contributes base risk.`
  );
  pushDriver(
    'Data Type',
    dataTypeScoreMap[dataType] ?? dataTypeScoreMap.other,
    `Data type ${dataType || 'other'} adds compliance handling pressure.`
  );

  pushSignal(`Sensitivity is ${sensitivity.toUpperCase()}.`);
  pushSignal(`Data type ${dataType || 'other'} carries elevated handling expectations.`);

  if (externalSharing) {
    riskScore += 12;
    pushSignal('Business purpose indicates external sharing exposure.');
    pushDriver('External Sharing', 12, 'Purpose suggests exposure outside trusted boundary.');
  }

  if (collaborativePurpose) {
    riskScore += 5;
    pushSignal('Purpose indicates collaborative updates and multi-user access.');
    pushDriver('Collaborative Workflow', 5, 'Multi-user workflow increases change surface.');
  }

  if (requestedDuration > 24) {
    riskScore += 4;
    pushSignal('Requested duration exceeds a single day.');
    pushDriver('Access Duration', 4, 'Duration above 24h expands exposure window.');
  }

  if (requestedDuration > 72) {
    riskScore += 6;
    pushSignal('Requested duration exceeds 72 hours and increases exposure window.');
    pushDriver('Access Duration', 6, 'Duration above 72h significantly expands exposure.');
  }

  if (requestedDuration > 168) {
    riskScore += 8;
    pushSignal('Requested duration exceeds one week.');
    pushDriver('Access Duration', 8, 'Duration above one week is high persistence risk.');
  }

  if (largeFile) {
    riskScore += 6;
    pushSignal(`Large file footprint (${fileSizeMb.toFixed(1)} MB) increases accidental leak impact.`);
    pushDriver('File Size', 6, `Large payload (${fileSizeMb.toFixed(1)} MB) raises blast radius.`);
  }

  if (shortLivedPurpose) {
    riskScore -= 4;
    pushSignal('Short-lived purpose reduces required access window.');
    pushDriver('Short-Lived Purpose', -4, 'Temporary use-case lowers persistence risk.');
  }

  riskScore = clampNumber(riskScore, 5, 99);
  const riskLevel = classifyRiskLevel(riskScore);

  const byRisk = {
    low: { permissionFloor: 'edit', expiryCap: 168, attemptsCap: 8, confidence: 0.74 },
    medium: { permissionFloor: 'edit', expiryCap: 72, attemptsCap: 5, confidence: 0.79 },
    high: { permissionFloor: 'view', expiryCap: 24, attemptsCap: 3, confidence: 0.84 },
    critical: { permissionFloor: 'view', expiryCap: 12, attemptsCap: 2, confidence: 0.88 }
  };

  const riskProfile = byRisk[riskLevel];
  const suggestedPermission =
    riskLevel === 'low'
      ? collaborativePurpose
        ? 'edit'
        : 'view'
      : riskLevel === 'medium'
        ? collaborativePurpose && !externalSharing
          ? 'edit'
          : 'view'
        : 'view';

  const permissionLevel = clipToPermissionFloor(suggestedPermission, riskProfile.permissionFloor);
  const expiryHours = Math.min(requestedDuration, riskProfile.expiryCap);
  const maxAccessAttempts = Math.min(requestedAttempts, riskProfile.attemptsCap);

  const riskExplanation = `Risk score ${riskScore}/100 (${riskLevel.toUpperCase()}) based on sensitivity, data type, purpose, duration, and requested access needs. Recommended least-privilege controls keep access bounded and enforce encrypted handling.`;
  const decisionSummary = `Recommend bounded access for ${expiryHours}h with ${maxAccessAttempts} max attempts and mandatory encryption.`;
  const recommendedControls = deriveRecommendedControls({ riskLevel, externalSharing, largeFile });

  return {
    permissionLevel,
    expiryHours,
    encryptionRequired: true,
    maxAccessAttempts,
    riskExplanation,
    confidence: riskProfile.confidence,
    uploadModuleRecommendations: buildUploadModuleRecommendations({
      riskLevel,
      externalSharing,
      largeFile
    }),
    riskScore,
    riskLevel,
    riskSignals: signals,
    decisionSummary,
    reviewChecklist: buildReviewChecklist({ riskLevel, externalSharing }),
    recommendedControls,
    riskDrivers,
    guardrailsApplied: [],
    engine
  };
};

const sanitizeRecommendation = (recommendation, baselineRecommendation) => {
  const uploadModuleRecommendations = Array.isArray(recommendation.uploadModuleRecommendations)
    ? recommendation.uploadModuleRecommendations
        .filter((item) => typeof item === 'string' && item.trim().length > 8)
        .slice(0, 3)
    : [];

  const reviewChecklist = Array.isArray(recommendation.reviewChecklist)
    ? recommendation.reviewChecklist
        .filter((item) => typeof item === 'string' && item.trim().length > 12)
        .slice(0, 3)
    : [];

  const normalizedUploadRecommendations =
    uploadModuleRecommendations.length === 3
      ? uploadModuleRecommendations
      : baselineRecommendation.uploadModuleRecommendations;

  const normalizedReviewChecklist =
    reviewChecklist.length === 3 ? reviewChecklist : baselineRecommendation.reviewChecklist;

  const guardrailsApplied = [];
  const candidatePermission = normalizePermission(
    recommendation.permissionLevel,
    baselineRecommendation.permissionLevel
  );

  const guardedPermission = clipToPermissionFloor(
    candidatePermission,
    toPermissionFloor(baselineRecommendation.permissionLevel)
  );
  if (guardedPermission !== candidatePermission) {
    guardrailsApplied.push('permission-level-capped');
  }

  const candidateExpiryHours = clampNumber(recommendation.expiryHours, 1, 24 * 90);
  const guardedExpiryHours = Math.min(candidateExpiryHours, baselineRecommendation.expiryHours);
  if (guardedExpiryHours !== candidateExpiryHours) {
    guardrailsApplied.push('expiry-capped');
  }

  const candidateMaxAttempts = clampNumber(recommendation.maxAccessAttempts, 1, 20);
  const guardedMaxAttempts = Math.min(candidateMaxAttempts, baselineRecommendation.maxAccessAttempts);
  if (guardedMaxAttempts !== candidateMaxAttempts) {
    guardrailsApplied.push('attempt-limit-capped');
  }

  const aiControls =
    recommendation && typeof recommendation.recommendedControls === 'object'
      ? recommendation.recommendedControls
      : {};
  const baselineControls = baselineRecommendation.recommendedControls || {};
  const baselineTokenTtl = clampNumber(baselineControls.maxTokenTtlMinutes, 5, 720);
  const aiTokenTtlCandidate = Number.isFinite(Number(aiControls.maxTokenTtlMinutes))
    ? clampNumber(aiControls.maxTokenTtlMinutes, 5, 720)
    : baselineTokenTtl;
  const normalizedControls = {
    requireTokenPassword: Boolean(
      baselineControls.requireTokenPassword || aiControls.requireTokenPassword
    ),
    maxTokenTtlMinutes: Math.min(aiTokenTtlCandidate, baselineTokenTtl),
    requireStrictAuditTrail: true
  };
  if (Number.isFinite(Number(aiControls.maxTokenTtlMinutes)) && normalizedControls.maxTokenTtlMinutes !== aiTokenTtlCandidate) {
    guardrailsApplied.push('token-ttl-capped');
  }

  const riskDrivers = Array.isArray(baselineRecommendation.riskDrivers)
    ? baselineRecommendation.riskDrivers.slice(0, 8)
    : [];

  const aiConfidence = Math.max(0, Math.min(1, Number(recommendation.confidence) || baselineRecommendation.confidence));
  const blendedConfidence = Math.max(
    0.6,
    Math.min(0.95, Number(((aiConfidence + baselineRecommendation.confidence) / 2).toFixed(2)))
  );

  return {
    permissionLevel: guardedPermission,
    expiryHours: guardedExpiryHours,
    encryptionRequired: true,
    maxAccessAttempts: guardedMaxAttempts,
    riskExplanation:
      typeof recommendation.riskExplanation === 'string' && recommendation.riskExplanation.trim().length > 10
        ? recommendation.riskExplanation.trim()
        : baselineRecommendation.riskExplanation,
    confidence: blendedConfidence,
    uploadModuleRecommendations: normalizedUploadRecommendations,
    decisionSummary:
      typeof recommendation.decisionSummary === 'string' && recommendation.decisionSummary.trim().length > 12
        ? recommendation.decisionSummary.trim()
        : baselineRecommendation.decisionSummary,
    reviewChecklist: normalizedReviewChecklist,
    recommendedControls: normalizedControls,
    riskDrivers,
    riskScore: baselineRecommendation.riskScore,
    riskLevel: baselineRecommendation.riskLevel,
    riskSignals: baselineRecommendation.riskSignals,
    guardrailsApplied,
    engine: 'hybrid-ai+rule-v2'
  };
};

const generatePolicyRecommendation = async (context) => {
  const baselineRecommendation = buildDeterministicRecommendation(context);
  const prompt = buildPolicyPrompt(context, baselineRecommendation);

  try {
    const aiResponse = await requestPolicyRecommendation(prompt);

    if (!aiResponse) {
      return {
        ...baselineRecommendation,
        engine: 'rule-fallback-v2'
      };
    }

    return sanitizeRecommendation(aiResponse, baselineRecommendation);
  } catch (_error) {
    return {
      ...baselineRecommendation,
      engine: 'rule-fallback-v2'
    };
  }
};

module.exports = { generatePolicyRecommendation };
