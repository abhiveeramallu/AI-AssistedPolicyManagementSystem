const { ROLES, PERMISSIONS } = require('../../constants/roles');

const permissionRank = {
  view: 1,
  edit: 2
};

const isPermissionAtLeast = (granted, requested) => {
  return permissionRank[granted] >= permissionRank[requested];
};

const canRolePerform = (role, permissionGroup) => {
  return permissionGroup.includes(role);
};

const isPolicyExpired = (policy) => {
  return new Date(policy.expiresAt).getTime() < Date.now();
};

const hasExceededAttempts = (fileDoc) => {
  return fileDoc.accessMetrics.attemptCount >= fileDoc.policy.maxAccessAttempts;
};

const resolveRequiredPermissionForRequest = (req) => {
  if (req.method === 'GET') {
    return 'view';
  }

  return 'edit';
};

const canUserAccessEndpoint = (user, endpointPermissionName) => {
  const permissionGroup = PERMISSIONS[endpointPermissionName] || [];
  return canRolePerform(user.role || ROLES.VIEWER, permissionGroup);
};

module.exports = {
  isPermissionAtLeast,
  canRolePerform,
  isPolicyExpired,
  hasExceededAttempts,
  resolveRequiredPermissionForRequest,
  canUserAccessEndpoint
};
