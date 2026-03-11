const { z } = require('zod');
const env = require('../config/env');

const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid resource identifier');

const recommendationPermissionSchema = z.enum(['view', 'edit']);
const sensitivitySchema = z.enum(['low', 'medium', 'high', 'critical']);
const dataTypeSchema = z.enum([
  'customer-data',
  'financial',
  'healthcare',
  'internal-doc',
  'source-code',
  'legal',
  'other'
]);

const generatePolicySchema = {
  body: z.object({
    dataType: dataTypeSchema,
    purpose: z.string().min(10).max(300),
    sensitivity: sensitivitySchema,
    durationHours: z.number().int().min(1).max(24 * 90),
    desiredPermission: recommendationPermissionSchema.optional(),
    maxAccessAttempts: z.number().int().min(1).max(20).optional(),
    fileName: z.string().min(1).max(200),
    fileType: z.string().min(1).max(120),
    fileSize: z.number().int().positive().max(env.maxFileSizeBytes)
  })
};

const approvePolicySchema = {
  body: z.object({
    proposalId: objectIdSchema,
    approved: z.boolean(),
    approvalNote: z.string().max(300).optional(),
    overrides: z
      .object({
        permissionLevel: recommendationPermissionSchema.optional(),
        expiryHours: z.number().int().min(1).max(24 * 90).optional(),
        maxAccessAttempts: z.number().int().min(1).max(20).optional(),
        encryptionRequired: z.boolean().optional()
      })
      .optional()
  })
};

const uploadSchema = {
  body: z.object({
    proposalId: objectIdSchema
  })
};

const fileIdParamSchema = {
  params: z.object({
    id: objectIdSchema
  })
};

const generateTokenSchema = {
  body: z.object({
    fileId: objectIdSchema,
    permissionLevel: recommendationPermissionSchema.optional(),
    expiryMinutes: z.number().int().min(1).max(24 * 60),
    maxUsageCount: z.number().int().min(1).max(20).optional(),
    accessPassword: z.string().min(6).max(128).optional()
  })
};

const validateTokenSchema = {
  body: z.object({
    token: z.string().min(10),
    password: z.string().min(6).max(128).optional()
  })
};

module.exports = {
  generatePolicySchema,
  approvePolicySchema,
  uploadSchema,
  fileIdParamSchema,
  generateTokenSchema,
  validateTokenSchema
};
