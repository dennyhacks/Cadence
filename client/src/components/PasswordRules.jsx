import { PASSWORD_RULES } from '../validation.js';

/** A live checklist: each rule turns green as the password meets it. */
export default function PasswordRules({ value }) {
  return (
    <ul className="mt-3 grid gap-1.5 text-sm" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li key={rule.id} className={`flex items-center gap-2 ${met ? 'text-leaf-700' : 'text-muted'}`}>
            <span
              aria-hidden="true"
              className={`grid size-4 shrink-0 place-items-center rounded-full border ${
                met ? 'border-leaf-600 bg-leaf-600 text-white' : 'border-line bg-white'
              }`}
            >
              {met && (
                <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2.5 6.2 5 8.6l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            {rule.label}
            <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
