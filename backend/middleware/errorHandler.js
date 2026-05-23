/**
 * errorHandler.js
 * Standardized error handling with Request ID propagation
 */
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  // Log error with Request ID for internal monitoring
  console.error(`[ERROR][${req.id || 'NO_ID'}] ${req.method} ${req.originalUrl}:`, err);

  // Prisma Duplicate Key
  if (err.code === 'P2002') {
    return res.status(400).json({
      success: false,
      message: 'Duplicate record found. This code or name is already in use.',
      requestId: req.id
    });
  }

  // Prisma Foreign Key Failure
  if (err.code === 'P2003') {
    return res.status(400).json({
      success: false,
      message: 'Resource link failed. Ensure the related ID exists.',
      requestId: req.id
    });
  }

  // Prisma Record Not Found
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'The requested record could not be found.',
      requestId: req.id
    });
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed. Please log in again.',
      requestId: req.id
    });
  }

  // Default Error Response
  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'An internal server error occurred' : err.message,
    requestId: req.id,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
