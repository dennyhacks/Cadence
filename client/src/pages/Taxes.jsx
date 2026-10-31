import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorAlert } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { addLinkClass } from './Products.jsx';
import { useTitle } from '../useTitle.js';

export default function Taxes() {
  useTitle('Taxes');
  const [taxes, setTaxes] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/taxes').then((d) => setTaxes(d.taxes)).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader title="Taxes">Tax rules are applied to subscription lines and invoices automatically.</PageHeader>
      <div className="mb-4">
        <Link to="/taxes/new" className={addLinkClass}>Add tax</Link>
      </div>
      <ErrorAlert>{error}</ErrorAlert>
      {!error && taxes === null && <p className="text-muted">Loading taxes…</p>}
      {taxes?.length === 0 && <p className="text-muted">No taxes yet. Add the first one.</p>}
      {taxes?.length > 0 && (
        <div className="max-w-2xl overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Rate</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Applied</th>
              </tr>
            </thead>
            <tbody>
              {taxes.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/taxes/${t.id}`} className="text-leaf-700 underline-offset-2 hover:underline">{t.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-right">{t.rate}%</td>
                  <td className="px-4 py-3">
                    {t.apply_automatically ? (
                      <span className="rounded-full bg-leaf-50 px-2.5 py-0.5 text-xs font-medium text-leaf-700">Automatically</span>
                    ) : (
                      <span className="text-muted">When chosen</span>
                    )}
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
