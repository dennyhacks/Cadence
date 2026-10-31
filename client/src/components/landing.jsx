import { useEffect, useRef, useState } from 'react';

// Interactive pieces for the front page. All of them switch themselves off for people who prefer reduced motion,
// and the cursor effects only run with a mouse or trackpad, never on a touch screen.

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => window.matchMedia('(pointer: fine)').matches;

/** A ring that follows the mouse with a little lag, and grows over anything clickable. */
export function CursorRing() {
  const ring = useRef(null);

  useEffect(() => {
    if (!finePointer() || reducedMotion()) return undefined;
    const el = ring.current;
    let x = -100;
    let y = -100;
    let rx = -100;
    let ry = -100;
    let frame;

    const move = (e) => {
      x = e.clientX;
      y = e.clientY;
      const target = e.target.closest?.('a, button, [data-cursor]');
      el.dataset.active = target ? '1' : '0';
      el.dataset.label = target?.dataset.cursor ?? '';
      el.style.opacity = '1';
    };
    const leave = () => {
      el.style.opacity = '0';
    };
    const loop = () => {
      rx += (x - rx) * 0.2;
      ry += (y - ry) * 0.2;
      el.style.transform = `translate(${rx}px, ${ry}px)`;
      frame = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', move);
    document.addEventListener('mouseleave', leave);
    loop();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', move);
      document.removeEventListener('mouseleave', leave);
    };
  }, []);

  return <div ref={ring} aria-hidden="true" className="cursor-ring" data-active="0" data-label="" />;
}

/** Fades sections in as they scroll into view. Without JavaScript or with reduced motion, everything just shows. */
export function useReveal() {
  useEffect(() => {
    if (reducedMotion() || !('IntersectionObserver' in window)) return undefined;
    const root = document.documentElement;
    root.classList.add('reveal-on');
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            seen.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('[data-reveal]').forEach((n) => seen.observe(n));
    return () => {
      seen.disconnect();
      root.classList.remove('reveal-on');
    };
  }, []);
}

/** Cards light up around the mouse. Put it on a list and give each item the `spotlight` class. */
export function useSpotlight() {
  const ref = useRef(null);
  useEffect(() => {
    const list = ref.current;
    if (!list || !finePointer() || reducedMotion()) return undefined;
    const move = (e) => {
      for (const card of list.querySelectorAll('.spotlight')) {
        const box = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - box.left}px`);
        card.style.setProperty('--my', `${e.clientY - box.top}px`);
      }
    };
    list.addEventListener('mousemove', move);
    return () => list.removeEventListener('mousemove', move);
  }, []);
  return ref;
}

/** Counts up to a number the first time it is seen. */
export function CountUp({ to, suffix = '' }) {
  const ref = useRef(null);
  const [value, setValue] = useState(reducedMotion() ? to : 0);

  useEffect(() => {
    if (reducedMotion() || !('IntersectionObserver' in window)) {
      setValue(to);
      return undefined;
    }
    let frame;
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      seen.disconnect();
      const started = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - started) / 1300);
        setValue(Math.round(to * (1 - (1 - t) ** 3)));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
    seen.observe(ref.current);
    return () => {
      seen.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to]);

  return <span ref={ref}>{value.toLocaleString('en-IN')}{suffix}</span>;
}

/** Tilts a card a few degrees toward the mouse. */
export function Tilt({ children, className = '' }) {
  const ref = useRef(null);
  const onMove = (e) => {
    if (!finePointer() || reducedMotion()) return;
    const box = ref.current.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width - 0.5;
    const py = (e.clientY - box.top) / box.height - 0.5;
    ref.current.style.transform = `perspective(1100px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg)`;
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={reset} className={`transition-transform duration-200 ease-out ${className}`}>
      {children}
    </div>
  );
}

// ---- The tour: five modules, one mock screen each ----

const Bar = ({ h, tone = 'bg-black' }) => <span className={`w-full rounded-t-md ${tone}`} style={{ height: `${h}%` }} />;

const MODULES = [
  {
    id: 'catalog',
    title: 'Products and plans',
    text: 'Add a product, give it variants, and choose how its plan bills.',
    screen: (
      <div className="space-y-3">
        <p className="font-display text-lg font-semibold">Team Workspace Suite</p>
        {[['Brand: Odoo', '+₹560', '₹2,960'], ['Brand: Zoho', '+₹320', '₹2,720'], ['Brand: Custom', '+₹0', '₹2,400']].map(([v, extra, price]) => (
          <div key={v} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm">
            <span className="font-medium">{v}</span>
            <span className="text-black/50">{extra}</span>
            <span className="font-semibold">{price}</span>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1 text-xs font-medium">
          {['Daily', 'Weekly', 'Monthly', 'Yearly'].map((p, i) => (
            <span key={p} className={`rounded-full px-3 py-1 ${i === 2 ? 'bg-black text-white' : 'bg-black/10'}`}>{p}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'subs',
    title: 'Subscriptions',
    text: 'One contract per customer, with a status the whole team can see.',
    screen: (
      <div className="space-y-4">
        <p className="font-display text-lg font-semibold">SUB-00004 · Northwind Traders</p>
        <ol className="flex flex-wrap gap-1.5 text-xs font-medium">
          {['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'].map((s, i) => (
            <li key={s} className={`rounded-full px-3 py-1.5 ${i === 3 ? 'bg-[#d8fd34] text-black' : i < 3 ? 'bg-black/10' : 'bg-black/5 text-black/40'}`}>{s}</li>
          ))}
        </ol>
        {[['Team Workspace Suite', '1 × ₹2,960.00'], ['Priority Support', '1 × ₹600.00']].map(([n, v]) => (
          <div key={n} className="flex justify-between rounded-xl bg-white px-4 py-3 text-sm"><span className="font-medium">{n}</span><span>{v}</span></div>
        ))}
        <p className="text-sm text-black/60">Starter monthly · starts 1 Mar 2026 · pay in 15 days</p>
      </div>
    ),
  },
  {
    id: 'invoices',
    title: 'Automatic invoices',
    text: 'Created every period with taxes and discounts already worked out.',
    screen: (
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between"><p className="font-display text-lg font-semibold">INV-00007</p><span className="rounded-full bg-black/10 px-3 py-1 text-xs font-medium">Confirmed</span></div>
        {[['Subtotal', '₹4,059.00'], ['Welcome 10%', '−₹356.00'], ['Annual commitment', '−₹500.00'], ['GST 18%', '₹486.72']].map(([k, v]) => (
          <div key={k} className="flex justify-between rounded-xl bg-white px-4 py-2.5"><span>{k}</span><span className="font-medium">{v}</span></div>
        ))}
        <div className="flex justify-between rounded-xl bg-black px-4 py-3 font-semibold text-white"><span>Total</span><span>₹3,689.72</span></div>
      </div>
    ),
  },
  {
    id: 'pay',
    title: 'Pay online',
    text: 'Customers pay from their invoice. The team records the rest.',
    screen: (
      <div className="space-y-3 text-sm">
        <p className="font-display text-lg font-semibold">Pay this invoice</p>
        <div className="rounded-xl bg-white px-4 py-3 text-black/60">4242 4242 4242 4242</div>
        <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-white px-4 py-3 text-black/60">12/30</div><div className="rounded-xl bg-white px-4 py-3 text-black/60">123</div></div>
        <div className="rounded-full bg-[#d8fd34] px-5 py-3 text-center font-semibold">Pay ₹1,845.72</div>
        <p className="text-xs text-black/50">Test mode: no real money moves.</p>
      </div>
    ),
  },
  {
    id: 'dash',
    title: 'Finance dashboard',
    text: 'Active, invoiced, collected and overdue, in one place.',
    screen: (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[['Invoiced', '₹42,411'], ['Collected', '₹22,067'], ['Overdue', '₹20,343']].map(([k, v], i) => (
            <div key={k} className="rounded-xl bg-white p-3"><p className="text-black/50">{k}</p><p className={`mt-1 font-display text-base font-semibold ${i === 2 ? 'text-[#b3382c]' : ''}`}>{v}</p></div>
          ))}
        </div>
        <div className="flex h-36 items-end gap-2 rounded-xl bg-white p-4">
          {[[0, 0], [0, 0], [78, 0], [0, 0], [16, 16], [14, 14], [13, 13], [13, 13], [16, 16], [16, 16], [16, 8], [0, 0]].map(([a, b], i) => (
            <div key={i} className="flex h-full w-full items-end gap-0.5">
              <Bar h={a} tone="bg-[#bc7f0c]" />
              <Bar h={b} tone="bg-[#17a58b]" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

/** Click a module on the left to see its screen on the right. It also moves on by itself until you pause it. */
export function ModuleTour() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || reducedMotion()) return undefined;
    const id = setTimeout(() => setActive((a) => (a + 1) % MODULES.length), 5200);
    return () => clearTimeout(id);
  }, [active, paused]);

  const current = MODULES[active];

  return (
    <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.15fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div role="tablist" aria-label="Modules" aria-orientation="vertical" className="flex flex-col gap-2">
        {MODULES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            id={`tab-${m.id}`}
            aria-selected={i === active}
            aria-controls="tour-panel"
            data-cursor={i === active ? '' : 'Show'}
            onClick={() => setActive(i)}
            className={`group relative overflow-hidden rounded-2xl border px-5 py-4 text-left transition-colors ${
              i === active ? 'border-leaf-600/60 bg-surface' : 'border-line hover:border-white/30'
            }`}
          >
            <span className="flex items-center gap-3">
              <span className={`font-display text-sm font-semibold ${i === active ? 'text-leaf-600' : 'text-muted'}`}>0{i + 1}</span>
              <span className="font-display text-lg font-semibold">{m.title}</span>
            </span>
            {i === active && <span className="mt-1.5 block pl-8 text-sm text-muted">{m.text}</span>}
            {i === active && !paused && !reducedMotion() && (
              <span key={`${active}-bar`} className="tour-progress absolute inset-x-0 bottom-0 h-0.5 bg-leaf-600" aria-hidden="true" />
            )}
          </button>
        ))}
        <div className="mt-2 flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {MODULES.map((m, i) => (
              <span key={m.id} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-leaf-600' : 'w-1.5 bg-white/25'}`} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:bg-white/10"
          >
            {paused ? 'Play' : 'Pause'}
          </button>
        </div>
      </div>

      <div id="tour-panel" role="tabpanel" aria-labelledby={`tab-${current.id}`} className="relative">
        <div key={current.id} className="tour-screen rounded-3xl border border-white/10 bg-[#f4f4f2] p-5 text-black shadow-[0_30px_100px_-30px_rgba(216,253,52,0.3)] sm:p-7">
          {current.screen}
        </div>
        <div className="float-slow absolute -top-4 right-6 hidden items-center gap-2 rounded-full border border-white/10 bg-surface px-3.5 py-1.5 text-xs font-medium text-white sm:flex" aria-hidden="true">
          <span className="size-2 rounded-full bg-leaf-600" /> Preview of the app
        </div>
      </div>
    </div>
  );
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const HEADER_GAP = 92; // the floating menu sits over the top of the page

/** Makes in-page links (#problem and so on) glide to their section instead of jumping. Reduced motion keeps the jump. */
export function useSmoothAnchors() {
  useEffect(() => {
    let frame = 0;
    const cancel = () => cancelAnimationFrame(frame);

    function onClick(e) {
      const link = e.target.closest?.('a[href^="#"]');
      if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;

      e.preventDefault();
      history.replaceState(null, '', link.getAttribute('href'));
      const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - (target.id === 'story' ? 0 : HEADER_GAP));

      // A hidden tab pauses animation frames, so it jumps instead of waiting for a glide that never runs.
      if (reducedMotion() || document.hidden) {
        window.scrollTo(0, top);
        target.focus?.({ preventScroll: true });
        return;
      }
      cancel();
      const from = window.scrollY;
      const distance = top - from;
      const duration = Math.min(1100, Math.max(500, Math.abs(distance) * 0.5));
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        window.scrollTo(0, from + distance * easeInOutCubic(t));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }

    // Scrolling by hand with the wheel or a finger stops the glide straight away.
    document.addEventListener('click', onClick);
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    return () => {
      cancel();
      document.removeEventListener('click', onClick);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
    };
  }, []);
}

/** The id of the section nearest the middle of the screen, so the menu can show where you are. */
export function useActiveSection(ids) {
  const [active, setActive] = useState('');
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined;
    const seen = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting);
        setActive(ids.find((id) => seen.get(id)) ?? '');
      },
      { rootMargin: '-35% 0px -55% 0px' }
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return active;
}
