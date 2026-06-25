/**
 * errorHandler.js
 * Global Express error handler.
 * Enforces the standard API response shape:
 *   { success, message, code, data, requestId }
 */
export const errorHandler = (err, req, res, next) => {  // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || 500;

  // Log with Request ID for traceability
  console.error(`[ERROR][${req.id || 'NO_ID'}] ${req.method} ${req.originalUrl}:`, err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);

  // ── Prisma Errors ──────────────────────────────────────────────────────────
  if (err.code === 'P2002') {
    return res.status(400).json({
      success: false,
      message: 'Duplicate record. This value is already in use.',
      code:    'DUPLICATE_RECORD',
      data:    null,
      requestId: req.id,
    });
  }

  if (err.code === 'P2003') {
    return res.status(400).json({
      success: false,
      message: 'Related resource not found. Ensure the referenced ID exists.',
      code:    'FOREIGN_KEY_VIOLATION',
      data:    null,
      requestId: req.id,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'The requested record could not be found.',
      code:    'RECORD_NOT_FOUND',
      data:    null,
      requestId: req.id,
    });
  }

  // ── JWT Errors ─────────────────────────────────────────────────────────────
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Your session has expired. Please log in again.',
      code:    'TOKEN_EXPIRED',
      data:    null,
      requestId: req.id,
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token. Please log in again.',
      code:    'TOKEN_INVALID',
      data:    null,
      requestId: req.id,
    });
  }

  // ── Zod Validation Errors (if thrown from middleware) ─────────────────────
  if (err.name === 'ZodError') {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      code:    'VALIDATION_ERROR',
      data:    err.errors,
      requestId: req.id,
    });
  }

  // ── Multer File Upload Errors ──────────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'File is too large. Maximum allowed size exceeded.',
      code:    'FILE_TOO_LARGE',
      data:    null,
      requestId: req.id,
    });
  }

  // ── Default ───────────────────────────────────────────────────────────────
  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred.'
      : err.message,
    code:    err.code || 'INTERNAL_ERROR',
    data:    null,
    requestId: req.id,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
