/**
 * responseFormatter.js
 * Enforces a strict { success, message, code, data } API response structure globally.
 */

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

    if (body && typeof body === 'object') {
      newBody.success = body.success !== undefined ? body.success : !isError;
      newBody.message = body.message || newBody.message;
      newBody.code = body.code || newBody.code;

      const extraKeys = Object.keys(body).filter(k => !['success', 'message', 'code', 'data'].includes(k));

      if (body.data !== undefined) {
        if (typeof body.data === 'object' && body.data !== null && extraKeys.length > 0) {
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

    return originalJson.call(this, newBody);
  };

  next();
};
