const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createAccessPasswordRecord = (password) => {
  const passwordSalt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, passwordSalt, 32).toString('hex');

  return {
    passwordSalt,
    passwordHash
  };
};

const verifyAccessPassword = ({ password, passwordSalt, passwordHash }) => {
  if (!passwordHash) return true;
  if (!password || !passwordSalt) return false;

  try {
    const expected = Buffer.from(passwordHash, 'hex');
    const supplied = crypto.scryptSync(password, passwordSalt, expected.length);

    if (supplied.length !== expected.length) return false;
    return crypto.timingSafeEqual(supplied, expected);
  } catch (_error) {
    return false;
  }
};

const normalizeShareCode = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const createFriendlyShareCode = ({ tokenId, jti, fileId }) => {
  const material = `${tokenId}:${jti}:${fileId}`;
  return normalizeShareCode(
    crypto.createHmac('sha256', env.fileTokenSecret).update(material).digest('base64url')
  ).slice(0, 16);
};

const compareSafely = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyFriendlyShareCode = ({ providedCode, tokenId, jti, fileId }) => {
  const normalizedProvided = normalizeShareCode(providedCode);
  const expected = createFriendlyShareCode({ tokenId, jti, fileId });
  return compareSafely(normalizedProvided, expected);
};

const issueFileAccessToken = ({
  fileId,
  delegatedBy,
  permissionLevel,
  expiresIn,
  maxUsageCount,
  jti: providedJti
}) => {
  const jti = providedJti || crypto.randomUUID();
  const token = jwt.sign(
    {
      jti,
      type: 'file_access',
      fileId,
      permissionLevel,
      maxUsageCount,
      delegatedBy
    },
    env.fileTokenSecret,
    { expiresIn }
  );

  return {
    token,
    jti,
    tokenHash: hashToken(token),
    decoded: jwt.decode(token)
  };
};

const verifyFileAccessToken = (token) => jwt.verify(token, env.fileTokenSecret);

const issueDemoUserToken = ({ userId, email, role }) => {
  return jwt.sign(
    {
      sub: userId,
      email,
      role
    },
    env.accessJwtSecret,
    { expiresIn: env.accessJwtExpiresIn }
  );
};

module.exports = {
  hashToken,
  createAccessPasswordRecord,
  verifyAccessPassword,
  createFriendlyShareCode,
  verifyFriendlyShareCode,
  issueFileAccessToken,
  verifyFileAccessToken,
  issueDemoUserToken
};
