/**
 * validateRequest.js
 *
 * Lightweight schema-based validation middleware.
 * Each schema is a plain object: { field: validatorFn }
 * Validators return a string error message or null if valid.
 *
 * Usage:
 *   import { validateRequest } from './validateRequest.js';
 *   import { bookingSchema } from '../schemas/bookingSchema.js';
 *   router.post('/', validateRequest(bookingSchema), controller);
 */
export const validateRequest = (schema) => (req, res, next) => {
  const errors = [];

  for (const [field, validator] of Object.entries(schema)) {
    const error = validator(req.body[field], req.body);
    if (error) errors.push({ field, message: error });
  }

  if (errors.length > 0) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};
