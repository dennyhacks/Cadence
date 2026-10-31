import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorAlert } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { addLinkClass } from './Products.jsx';
import { formatDay, formatMoney } from '../format.js';
import { useTitle } from '../useTitle.js';

const STATUS = {
  active: ['Active', 'bg-leaf-50 text-leaf-700'],
  upcoming: ['Starts later', 'bg-paper text-muted ring-1 ring-line'],
  expired: ['Expired', 'bg-paper text-muted ring-1 ring-line'],
  used_up: ['Used up', 'bg-danger-bg text-danger'],
};

export const discountValue = (d) => (d.type === 'percentage' ? `${d.value}%` : formatMoney(d.value));

export default function Discounts() {
  useTitle('Discounts');
  const [discounts, setDiscounts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/discounts').then((d) => setDiscounts(d.discounts)).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader title="Discounts">
        Discounts apply to the next invoice on their own, and stop when they expire or run out.
      </PageHeader>
      <div className="mb-4">
        <Link to="/discounts/new" className={addLinkClass}>Add discount</Link>
      </div>
      <ErrorAlert>{error}</ErrorAlert>
      {!error && discounts === null && <p className="text-muted">Loading discounts…</p>}
      {discounts?.length === 0 && <p className="text-muted">No discounts yet. Add the first one.</p>}
      {discounts?.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Discount</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Applies to</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Dates</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Used</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => {
                const [label, tone] = STATUS[d.status];
                return (
                  <tr key={d.id} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/discounts/${d.id}`} className="text-leaf-700 underline-offset-2 hover:underline">{d.name}</Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{discountValue(d)}</td>
                    <td className="px-4 py-3">
                      {d.applies_to === 'subscription' ? 'Whole subscription' : d.product_names}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDay(d.start_date)} to {d.end_date ? formatDay(d.end_date) : 'no end date'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {d.times_used}{d.usage_limit != null ? ` of ${d.usage_limit}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
