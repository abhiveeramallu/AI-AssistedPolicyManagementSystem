const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCsv = (value, fallback = []) => {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const rootDir = path.resolve(__dirname, '..', '..');

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 5050),
  corsOrigin: parseCsv(process.env.CORS_ORIGIN, ['http://localhost:5173', 'http://127.0.0.1:5173']),
  accessJwtSecret: process.env.ACCESS_JWT_SECRET || 'unsafe_dev_secret_change_me',
  accessJwtExpiresIn: process.env.ACCESS_JWT_EXPIRES_IN || '1h',
  fileTokenSecret: process.env.FILE_TOKEN_SECRET || 'unsafe_file_token_secret_change_me',
  fileTokenExpiresIn: process.env.FILE_TOKEN_EXPIRES_IN || '30m',
  masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY || '',
  encryptedStoragePath: path.resolve(rootDir, process.env.ENCRYPTED_STORAGE_PATH || './storage/encrypted'),
  localDbPath: path.resolve(rootDir, process.env.LOCAL_DB_PATH || './storage/local-db.json'),
  maxFileSizeBytes: toNumber(process.env.MAX_FILE_SIZE_MB, 15) * 1024 * 1024,
  allowedFileTypes: parseCsv(process.env.ALLOWED_FILE_TYPES, [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain'
  ]),
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openAiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
};

module.exports = env;
