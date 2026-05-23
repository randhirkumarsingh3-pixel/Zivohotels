/**
 * asyncHandler.js
 * Wrapper to eliminate try-catch blocks in async controllers
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
