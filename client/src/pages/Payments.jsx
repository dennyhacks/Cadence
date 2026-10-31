import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorAlert } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { METHODS } from './InvoiceDetail.jsx';
import { formatDay, formatMoney } from '../format.js';
import { useTitle } from '../useTitle.js';

const PAGE_SIZE = 15;

export default function Payments() {
  useTitle('Payments');
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/payments?page=${page}&pageSize=${PAGE_SIZE}`).then(setData).catch((e) => setError(e.message));
  }, [page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Payments">Payments recorded against invoices. To record one, open the invoice.</PageHeader>
      <ErrorAlert>{error}</ErrorAlert>
      {!error && data === null && <p className="text-muted">Loading payments…</p>}
      {data?.payments.length === 0 && <p className="text-muted">No payments recorded yet.</p>}
      {data?.payments.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Invoice</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Method</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Note</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">{formatDay(p.paid_on)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      <Link to={`/invoices/${p.invoice_id}`} className="text-leaf-700 underline-offset-2 hover:underline">{p.invoice_number}</Link>
                    </td>
                    <td className="px-4 py-3">{p.customer_name}</td>
                    <td className="px-4 py-3">{METHODS[p.method]}</td>
                    <td className="px-4 py-3 text-muted">{p.note}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatMoney(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
            <p className="text-muted">{data.total} payment{data.total === 1 ? '' : 's'}</p>
            <div className="flex items-center gap-3">
              <button type="button" disabled={page <= 1} onClick={() => setParams({ page: page - 1 })} className="rounded-full border border-line px-3 py-1.5 font-medium enabled:hover:bg-white/10 disabled:opacity-50">Previous</button>
              <span>Page {page} of {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setParams({ page: page + 1 })} className="rounded-full border border-line px-3 py-1.5 font-medium enabled:hover:bg-white/10 disabled:opacity-50">Next</button>
            </div>
          </nav>
        </>
      )}
    </>
  );
}
