// Online payment runs in test mode: no real card is ever charged, and card details are never stored.
// Only these well-known test numbers are accepted, so a real card typed in by mistake is refused.
export const TEST_CARDS = {
  4242424242424242: 'approved',
  5555555555554444: 'approved',
  4000000000000002: 'declined',
};

/** The Luhn check every real card number passes, used to catch typing mistakes. */
export function luhn(number) {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i -= 1) {
    let digit = Number(number[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return number.length > 0 && sum % 10 === 0;
}

/** True while the card's last valid month has not passed. `expiry` is MM/YY. */
export function expiryInFuture(expiry, now = new Date()) {
  const [mm, yy] = expiry.split('/').map((p) => Number(p.trim()));
  const year = 2000 + yy;
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth() + 1;
  return year > thisYear || (year === thisYear && mm >= thisMonth);
}
