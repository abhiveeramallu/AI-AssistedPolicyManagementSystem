const crypto = require('crypto');
const env = require('../../config/env');

const IV_LENGTH = 12;

const deriveMasterKey = () => {
  if (!env.masterEncryptionKey) {
    throw new Error('MASTER_ENCRYPTION_KEY is required for encryption operations');
  }

  if (/^[0-9a-fA-F]{64}$/.test(env.masterEncryptionKey)) {
    return Buffer.from(env.masterEncryptionKey, 'hex');
  }

  // Fallback: deterministic key material for environments passing non-hex secrets.
  return crypto.createHash('sha256').update(env.masterEncryptionKey).digest();
};

const masterKey = deriveMasterKey();
const metadataKey = crypto
  .createHash('sha256')
  .update(Buffer.concat([masterKey, Buffer.from('metadata-key')]))
  .digest();
const wrapKey = crypto
  .createHash('sha256')
  .update(Buffer.concat([masterKey, Buffer.from('wrap-key')]))
  .digest();

const aes256GcmEncrypt = (key, payloadBuffer) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const cipherText = Buffer.concat([cipher.update(payloadBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    cipherText: cipherText.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
};

const aes256GcmDecrypt = (key, encryptedPayload) => {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(encryptedPayload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(encryptedPayload.authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPayload.cipherText, 'base64')),
    decipher.final()
  ]);
};

const wrapDataKey = (dataKey) => aes256GcmEncrypt(wrapKey, dataKey);
const unwrapDataKey = (wrappedKey) => aes256GcmDecrypt(wrapKey, wrappedKey);

const encryptFileBuffer = (fileBuffer) => {
  const dataKey = crypto.randomBytes(32);
  const payload = aes256GcmEncrypt(dataKey, fileBuffer);
  const wrappedKey = wrapDataKey(dataKey);

  return {
    encryptedData: Buffer.from(payload.cipherText, 'base64'),
    encryptionMetadata: {
      algorithm: 'aes-256-gcm',
      iv: payload.iv,
      authTag: payload.authTag,
      wrappedKey: wrappedKey.cipherText,
      wrappedKeyIv: wrappedKey.iv,
      wrappedKeyAuthTag: wrappedKey.authTag
    }
  };
};

const decryptFileBuffer = (encryptedBuffer, encryptionMetadata) => {
  const dataKey = unwrapDataKey({
    cipherText: encryptionMetadata.wrappedKey,
    iv: encryptionMetadata.wrappedKeyIv,
    authTag: encryptionMetadata.wrappedKeyAuthTag
  });

  return aes256GcmDecrypt(dataKey, {
    cipherText: encryptedBuffer.toString('base64'),
    iv: encryptionMetadata.iv,
    authTag: encryptionMetadata.authTag
  });
};

const encryptMetadata = (metadataObject) => {
  const serialized = Buffer.from(JSON.stringify(metadataObject), 'utf8');
  return aes256GcmEncrypt(metadataKey, serialized);
};

const decryptMetadata = (encryptedMetadata) => {
  const decrypted = aes256GcmDecrypt(metadataKey, encryptedMetadata);
  return JSON.parse(decrypted.toString('utf8'));
};

const createChecksum = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

module.exports = {
  encryptFileBuffer,
  decryptFileBuffer,
  encryptMetadata,
  decryptMetadata,
  createChecksum
};
