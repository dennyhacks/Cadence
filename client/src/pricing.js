// Preview of what the server will calculate. The server is the source of truth.
const cents = (n) => Math.round(n * 100);

export function linePreview(unitPrice, quantity, taxRates) {
  const subtotal = cents(unitPrice) * quantity;
  const tax = taxRates.reduce((sum, rate) => sum + Math.round((subtotal * rate) / 100), 0);
  return { subtotal: subtotal / 100, tax: tax / 100, total: (subtotal + tax) / 100 };
}
