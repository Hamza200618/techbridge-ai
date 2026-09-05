'use strict';

const multer = require('multer');
const config = require('../config/env');
const ApiError = require('../utils/apiError');

// Multipart upload handling for project ZIPs. Files are buffered in memory
// (bounded by maxFileSizeBytes) and validated before the service persists
// them. mimetype is advisory only — the real gate is the ZIP magic-byte
// check plus full parse in the storage layer.
const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxFileSizeBytes,
  },
  fileFilter: (req, file, cb) => {
    const hasZipExtension = /\.zip$/i.test(file.originalname || '');
    if (hasZipExtension || ZIP_MIME_TYPES.has(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new ApiError(400, 'INVALID_ZIP', 'Only ZIP project files are allowed.'));
  },
});

// Wraps multer so low-level errors surface as controlled ApiErrors handled
// by the centralized error handler instead of raw multer errors.
function uploadSingle(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (error) => {
      if (!error) {
        return next();
      }
      if (error instanceof ApiError) {
        return next(error);
      }
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(
          new ApiError(413, 'PAYLOAD_TOO_LARGE', `Uploaded file exceeds the ${config.upload.maxFileSizeMb} MB limit.`),
        );
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new ApiError(400, 'VALIDATION_ERROR', `Upload field must be named '${fieldName}'.`));
      }
      return next(error);
    });
  };
}

module.exports = { uploadSingle };
