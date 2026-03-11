const path = require('path');
const env = require('../config/env');
const { AppError } = require('../middleware/errorMiddleware');

const startsWithBytes = (buffer, signature) => {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
};

const isLikelyText = (buffer) => {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let printable = 0;

  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
      printable += 1;
    }
  }

  return sample.length > 0 && printable / sample.length > 0.9;
};

const detectMimeType = (file) => {
  const { buffer, mimetype, originalname } = file;
  const extension = path.extname(originalname || '').toLowerCase();

  if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf';
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  if (startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) && extension === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  if (isLikelyText(buffer)) return 'text/plain';

  return mimetype;
};

const validateUploadedFile = (file) => {
  if (!file) {
    throw new AppError('File is required', 400);
  }

  if (file.size > env.maxFileSizeBytes) {
    throw new AppError(`File exceeds maximum allowed size of ${env.maxFileSizeBytes} bytes`, 400);
  }

  const detectedMime = detectMimeType(file);

  if (!env.allowedFileTypes.includes(detectedMime)) {
    throw new AppError(`Unsupported file type: ${detectedMime}`, 400);
  }

  return {
    detectedMime,
    extension: path.extname(file.originalname || '').toLowerCase()
  };
};

module.exports = { validateUploadedFile };
