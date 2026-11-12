/**
 * responseFormatter.js
 * Enforces a strict { success, message, code, data } API response structure globally.
 */

// Text that only appears in internal errors (Prisma/DB/stack traces): never shown to users in production.
const INTERNAL_ERROR_PATTERN = /prisma|invalid `|raw query failed|\bP\d{4}\b|ECONNREFUSED|ETIMEDOUT|can't reach database|SQLSTATE|relation "|column "| {4}at [\w$.<>]+ \(/i;

const looksInternal = (value) => {
  if (typeof value === 'string') return INTERNAL_ERROR_PATTERN.test(value);
  if (value && typeof value === 'object') {
    try { return INTERNAL_ERROR_PATTERN.test(JSON.stringify(value)); } catch { return true; }
  }
  return false;
};

/**
 * In production, error responses must not reveal internals. Many controllers send
 * `error.message` directly, so this is enforced here, where every JSON response passes:
 *  - 5xx: generic message, no data
 *  - any error whose message or data contains DB/Prisma internals: generic message, no data
 * The requestId is kept so a user's report can be matched to the full error in the logs.
 */
const sanitizeErrorBody = (body, statusCode, req) => {
  const requestId = body.data?.requestId ?? body.meta?.requestId ?? req.id;
  if (statusCode >= 500) {
    return { success: false, message: 'An internal server error occurred. Please try again later.', code: 'INTERNAL_ERROR', data: null, requestId };
  }
  if (looksInternal(body.message) || looksInternal(body.data)) {
    return { success: false, message: 'The request could not be completed.', code: 'REQUEST_FAILED', data: null, requestId };
  }
  return body;
};

export const responseFormatter = (req, res, next) => {
  const originalJson = res.json;

  res.json = function (body) {
    if (res.headersSent || res.locals.skipFormat) {
      return originalJson.call(this, body);
    }

    const isError = res.statusCode >= 400;
    
    let newBody = {
      success: !isError,
      message: isError ? 'An error occurred' : 'Success',
      code: isError ? 'ERROR' : 'SUCCESS',
      data: null
    };

    if (Array.isArray(body)) {
      // Bare arrays (e.g. res.json([...])) are the payload itself. Without this branch the
      // generic object handling below turned them into {"0": ..., "1": ...} and [] into null.
      newBody.data = body;
    } else if (body && typeof body === 'object') {
      newBody.success = body.success !== undefined ? body.success : !isError;
      newBody.message = body.message || newBody.message;
      newBody.code = body.code || newBody.code;
      if (body.meta !== undefined) newBody.meta = body.meta;

      const extraKeys = Object.keys(body).filter(k => !['success', 'message', 'code', 'data', 'meta'].includes(k));

      if (body.data !== undefined) {
        if (Array.isArray(body.data)) {
          newBody.data = body.data;
          if (extraKeys.length > 0) {
            newBody.meta = newBody.meta || {};
            for (const key of extraKeys) {
              newBody.meta[key] = body[key];
            }
          }
        } else if (typeof body.data === 'object' && body.data !== null && extraKeys.length > 0) {
          // Merge extra root keys into data so they aren't lost
          newBody.data = { ...body.data };
          for (const key of extraKeys) {
            newBody.data[key] = body[key];
          }
        } else {
          newBody.data = body.data;
          // If data isn't an object but we have extra keys, wrap them
          if (extraKeys.length > 0) {
            newBody.data = { value: body.data };
            for (const key of extraKeys) {
              newBody.data[key] = body[key];
            }
          }
        }
      } else if (extraKeys.length > 0) {
        // No 'data' key, put everything else inside 'data'
        newBody.data = {};
        for (const key of extraKeys) {
          newBody.data[key] = body[key];
        }
      }
    } else if (body !== undefined) {
      newBody.data = body;
    }

    if (isError && process.env.NODE_ENV === 'production') {
      newBody = sanitizeErrorBody(newBody, res.statusCode, req);
    }

    return originalJson.call(this, newBody);
  };

  next();
};
