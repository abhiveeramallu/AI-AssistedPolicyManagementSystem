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

const issueFileAccessToken = ({ fileId, delegatedBy, permissionLevel, expiresIn, maxUsageCount }) => {
  const jti = crypto.randomUUID();
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
  issueFileAccessToken,
  verifyFileAccessToken,
  issueDemoUserToken
};
