import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorAlert } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { addLinkClass } from './Products.jsx';
import { useTitle } from '../useTitle.js';

export const lineSummary = (l) => `${l.quantity} × ${l.product_name}${l.variant ? ` (${l.variant.value})` : ''}`;

export default function Templates() {
  useTitle('Quotation templates');
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/templates').then((d) => setTemplates(d.templates)).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader title="Quotation templates">Reusable quotes with a plan and product lines.</PageHeader>
      <div className="mb-4">
        <Link to="/templates/new" className={addLinkClass}>Add template</Link>
      </div>
      <ErrorAlert>{error}</ErrorAlert>
      {!error && templates === null && <p className="text-muted">Loading templates…</p>}
      {templates?.length === 0 && <p className="text-muted">No templates yet. Add the first one.</p>}
      {templates?.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Plan</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Valid for</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Lines</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/templates/${t.id}`} className="text-leaf-700 underline-offset-2 hover:underline">{t.name}</Link>
                  </td>
                  <td className="px-4 py-3">{t.plan_name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{t.validity_days} days</td>
                  <td className="px-4 py-3 text-muted">{t.lines.map(lineSummary).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
