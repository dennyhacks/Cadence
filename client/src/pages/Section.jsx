import { useAuth } from '../auth/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useTitle } from '../useTitle.js';

/** A screen whose content is built in a later phase. Keeps the menu and routes real in the meantime. */
export default function Section({ title, customerTitle, intro, customerIntro }) {
  const { user } = useAuth();
  const mine = user.role === 'customer';
  const heading = mine && customerTitle ? customerTitle : title;
  useTitle(heading);

  return (
    <>
      <PageHeader title={heading}>{mine && customerIntro ? customerIntro : intro}</PageHeader>
      <div className="rounded-xl border border-dashed border-line bg-white px-6 py-14 text-center">
        <p className="font-display text-lg font-semibold">Nothing here yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-muted">
          {mine
            ? `Your ${heading.toLowerCase().replace(/^my /, '')} will appear here once your account has some.`
            : `${title} will be available here soon.`}
        </p>
      </div>
    </>
  );
}
