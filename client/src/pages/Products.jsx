import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorAlert } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { formatMoney } from '../format.js';
import { useTitle } from '../useTitle.js';

export const addLinkClass =
  'inline-flex items-center rounded-lg bg-leaf-600 px-4 py-2.5 font-semibold text-white hover:bg-leaf-700';

export default function Products() {
  useTitle('Products');
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/products').then((d) => setProducts(d.products)).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader title="Products">What you sell, with prices and variants.</PageHeader>
      <div className="mb-4">
        <Link to="/products/new" className={addLinkClass}>Add product</Link>
      </div>
      <ErrorAlert>{error}</ErrorAlert>
      {!error && products === null && <p className="text-muted">Loading products…</p>}
      {products?.length === 0 && <p className="text-muted">No products yet. Add the first one.</p>}
      {products?.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Sales price</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Cost price</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Variants</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/products/${p.id}`} className="text-leaf-700 underline-offset-2 hover:underline">{p.name}</Link>
                  </td>
                  <td className="px-4 py-3 capitalize">{p.type}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatMoney(p.sales_price)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatMoney(p.cost_price)}</td>
                  <td className="px-4 py-3 text-right">{p.variant_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
