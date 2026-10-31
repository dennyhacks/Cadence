import { HttpError } from '../utils/errors.js';

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'Not found.'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, ...(err.errors && { errors: err.errors }) });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'The request body is not valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'The request is too large.' });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on our side. Try again in a moment.' });
}
