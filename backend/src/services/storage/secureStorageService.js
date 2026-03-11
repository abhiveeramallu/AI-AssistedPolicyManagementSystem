const fs = require('fs/promises');
const path = require('path');
const env = require('../../config/env');

const ensureStorageDirectory = async () => {
  await fs.mkdir(env.encryptedStoragePath, { recursive: true });
};

const resolveStoragePath = (fileId) => path.join(env.encryptedStoragePath, `${fileId}.enc`);

const writeEncryptedFile = async (fileId, encryptedBuffer) => {
  await ensureStorageDirectory();
  const storagePath = resolveStoragePath(fileId);
  await fs.writeFile(storagePath, encryptedBuffer);
  return storagePath;
};

const readEncryptedFile = async (fileId) => {
  const storagePath = resolveStoragePath(fileId);
  const encryptedBuffer = await fs.readFile(storagePath);
  return { storagePath, encryptedBuffer };
};

const deleteEncryptedFile = async (fileId) => {
  const storagePath = resolveStoragePath(fileId);
  await fs.unlink(storagePath);
};

module.exports = {
  writeEncryptedFile,
  readEncryptedFile,
  deleteEncryptedFile
};
