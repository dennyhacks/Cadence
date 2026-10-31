import { Checkbox } from './Field.jsx';
import { inputClass } from './Field.jsx';
import { formatMoney } from '../format.js';
import { linePreview } from '../pricing.js';

export const emptyLine = (taxIds = []) => ({ product_id: '', variant: '', quantity: '1', tax_ids: taxIds });

/** Taxes the admin marked "apply automatically" start ticked on every new line. */
export const automaticTaxIds = (taxes) => taxes.filter((t) => t.apply_automatically).map((t) => t.id);

/** Variants are chosen as "Attribute: Value" strings so one select can hold them. */
export const variantKey = (v) => (v ? `${v.attribute}: ${v.value}` : '');

/**
 * Rows of product, variant, quantity and taxes, used by quotation templates and subscriptions.
 * Shows the price the server will use, so people see the total before they save.
 */
export default function LinesEditor({ lines, onChange, products, taxes, error }) {
  const update = (i, patch) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <fieldset className="rounded-xl border border-line bg-white p-4">
      <legend className="px-1 font-display text-lg font-semibold">Product lines</legend>
      {lines.map((line, i) => {
        const product = products.find((p) => p.id === Number(line.product_id));
        const variant = product?.variants?.find((v) => variantKey(v) === line.variant);
        const unit = product ? product.sales_price + (variant?.extra_price ?? 0) : null;
        const rates = taxes.filter((t) => line.tax_ids.includes(t.id)).map((t) => t.rate);
        const preview = unit != null && Number(line.quantity) >= 1 ? linePreview(unit, Number(line.quantity), rates) : null;

        return (
          <div key={i} className="mb-4 border-b border-line pb-4">
            <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_6rem_auto] sm:items-end">
              <div>
                <label htmlFor={`line-product-${i}`} className="text-sm font-medium">Product</label>
                <select
                  id={`line-product-${i}`}
                  className={`${inputClass(false)} mt-1.5`}
                  value={line.product_id}
                  onChange={(e) => update(i, { product_id: e.target.value, variant: '' })}
                >
                  <option value="">Choose a product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`line-variant-${i}`} className="text-sm font-medium">Variant</label>
                <select
                  id={`line-variant-${i}`}
                  className={`${inputClass(false)} mt-1.5`}
                  value={line.variant}
                  disabled={!product?.variants?.length}
                  onChange={(e) => update(i, { variant: e.target.value })}
                >
                  <option value="">{product?.variants?.length ? 'No variant' : 'None available'}</option>
                  {product?.variants?.map((v) => (
                    <option key={variantKey(v)} value={variantKey(v)}>
                      {variantKey(v)} (+{formatMoney(v.extra_price)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`line-quantity-${i}`} className="text-sm font-medium">Quantity</label>
                <input
                  id={`line-quantity-${i}`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  className={`${inputClass(false)} mt-1.5`}
                  value={line.quantity}
                  onChange={(e) => update(i, { quantity: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(lines.filter((_, j) => j !== i))}
                className="rounded-lg border border-line px-3 py-2.5 text-sm font-medium hover:bg-paper"
              >
                Remove<span className="sr-only"> line {i + 1}</span>
              </button>
            </div>

            {taxes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label={`Taxes for line ${i + 1}`}>
                {taxes.map((t) => (
                  <Checkbox
                    key={t.id}
                    id={`line-${i}-tax-${t.id}`}
                    label={`${t.name} (${t.rate}%)${t.apply_automatically ? ', automatic' : ''}`}
                    checked={line.tax_ids.includes(t.id)}
                    onChange={(e) =>
                      update(i, { tax_ids: e.target.checked ? [...line.tax_ids, t.id] : line.tax_ids.filter((x) => x !== t.id) })
                    }
                  />
                ))}
              </div>
            )}
            {preview && (
              <p className="mt-2 text-sm text-muted">
                {formatMoney(unit)} each. Line total {formatMoney(preview.total)}
                {preview.tax > 0 && ` including ${formatMoney(preview.tax)} tax`}.
              </p>
            )}
          </div>
        );
      })}
      {taxes.some((t) => t.apply_automatically) && (
        <p className="mb-3 text-sm text-muted">Taxes marked automatic are ticked on every new line. Untick one only when a line should leave it out.</p>
      )}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={() => onChange([...lines, emptyLine(automaticTaxIds(taxes))])}
        className="rounded-lg border border-line px-4 py-2 font-medium hover:bg-paper"
      >
        Add line
      </button>
    </fieldset>
  );
}

/** Turns the editor's text values into the body the API expects. */
export const linesToBody = (lines) =>
  lines.map((l) => {
    const [attribute, ...rest] = l.variant ? l.variant.split(': ') : [];
    return {
      product_id: l.product_id === '' ? undefined : Number(l.product_id),
      variant: l.variant ? { attribute, value: rest.join(': ') } : null,
      quantity: l.quantity === '' ? undefined : Number(l.quantity),
      tax_ids: l.tax_ids,
    };
  });

export const linesFromApi = (lines) =>
  lines.map((l) => ({ product_id: String(l.product_id), variant: variantKey(l.variant), quantity: String(l.quantity), tax_ids: l.tax_ids }));
