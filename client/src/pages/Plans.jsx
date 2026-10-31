import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorAlert } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { addLinkClass } from './Products.jsx';
import { formatDay, formatMoney } from '../format.js';
import { useTitle } from '../useTitle.js';

const OPTIONS = [
  ['auto_close', 'Closes on its own'],
  ['closable', 'Can be closed early'],
  ['pausable', 'Can be paused'],
  ['renewable', 'Can be renewed'],
];

export default function Plans() {
  useTitle('Plans');
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/plans').then((d) => setPlans(d.plans)).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader title="Plans">Billing periods, prices and availability.</PageHeader>
      <div className="mb-4">
        <Link to="/plans/new" className={addLinkClass}>Add plan</Link>
      </div>
      <ErrorAlert>{error}</ErrorAlert>
      {!error && plans === null && <p className="text-muted">Loading plans…</p>}
      {plans?.length === 0 && <p className="text-muted">No plans yet. Add the first one.</p>}
      {plans?.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Price</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Billed</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Min. quantity</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Available</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Options</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/plans/${p.id}`} className="text-leaf-700 underline-offset-2 hover:underline">{p.name}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatMoney(p.price)}</td>
                  <td className="px-4 py-3 capitalize">{p.billing_period}</td>
                  <td className="px-4 py-3 text-right">{p.min_quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDay(p.start_date)} to {p.end_date ? formatDay(p.end_date) : 'no end date'}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {OPTIONS.filter(([k]) => p[k]).map(([, label]) => label).join(', ') || 'None'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
