/**
 * promiseUtils.js
 */

export const withTimeout = (promise, ms, timeoutMessage = 'Operation timed out') => {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]);
};
