import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

/** Team-only search across subscriptions, invoices, products and plans. */
export default function SearchBox() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return undefined;
    }
    let stale = false;
    const timer = setTimeout(() => {
      api
        .get(`/search?q=${encodeURIComponent(q)}`)
        .then((d) => {
          if (stale) return;
          setResults(d.results);
          setSearched(true);
        })
        .catch(() => !stale && setResults([]));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [text]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function go(to) {
    setOpen(false);
    setText('');
    navigate(to);
  }

  return (
    <div ref={box} className="relative hidden w-full max-w-sm sm:block">
      <label htmlFor="global-search" className="sr-only">
        Search subscriptions, invoices, products and plans
      </label>
      <input
        id="global-search"
        type="search"
        autoComplete="off"
        placeholder="Search subscriptions, invoices…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="w-full rounded-full border border-line bg-paper px-4 py-1.5 text-sm placeholder:text-muted focus:border-leaf-600"
      />
      {open && text.trim().length >= 2 && searched && (
        <ul className="absolute left-0 right-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nothing found for “{text.trim()}”.</li>}
          {results.map((r) => (
            <li key={`${r.type}-${r.to}`}>
              <button type="button" onClick={() => go(r.to)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.label}</span>
                  <span className="block truncate text-muted">{r.detail}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{r.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
