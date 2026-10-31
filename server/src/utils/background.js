import { waitUntil } from '@vercel/functions';

/**
 * Lets work carry on after the response has been sent, such as sending an email, without making the
 * person wait. On a normal server the process simply keeps running. On Vercel the function would be frozen
 * the moment it replies, so waitUntil keeps it alive until the work finishes.
 */
export function afterReply(work, label) {
  const safe = Promise.resolve(work).catch((err) => console.error(`${label} failed:`, err.message));
  waitUntil(safe);
  return safe;
}
