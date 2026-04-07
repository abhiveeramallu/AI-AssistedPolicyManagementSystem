const crypto = require('crypto');

const hashPassword = (password) => {
  const passwordSalt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(String(password), passwordSalt, 32).toString('hex');

  return {
    passwordSalt,
    passwordHash
  };
};

const verifyPassword = ({ password, passwordSalt, passwordHash }) => {
  if (!passwordHash || !passwordSalt) return false;

  try {
    const expected = Buffer.from(passwordHash, 'hex');
    const supplied = crypto.scryptSync(String(password), passwordSalt, expected.length);

    if (expected.length !== supplied.length) return false;
    return crypto.timingSafeEqual(expected, supplied);
  } catch (_error) {
    return false;
  }
};

module.exports = {
  hashPassword,
  verifyPassword
};
