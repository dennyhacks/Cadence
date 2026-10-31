import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';
import { navFor } from '../layout/nav.js';
import { useTitle } from '../useTitle.js';

// The finance numbers arrive with the finance dashboard; until then this is the team's front door.
export default function Overview() {
  const { user } = useAuth();
  useTitle('Overview');
  const links = navFor(user.role).filter((item) => item.to !== '/');

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`}>Pick up where you left off.</PageHeader>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-4 font-medium transition-colors hover:border-leaf-600"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-leaf-50 text-leaf-700">
                <Icon name={item.icon} />
              </span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
