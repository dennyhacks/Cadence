// One menu per role. `icon` names a glyph in components/Icon.jsx.
const TEAM = ['admin', 'staff'];

export const NAV = [
  { to: '/', label: 'Overview', icon: 'home', roles: TEAM, end: true },
  { to: '/products', label: 'Products', icon: 'box', roles: TEAM },
  { to: '/plans', label: 'Plans', icon: 'cycle', roles: TEAM },
  { to: '/taxes', label: 'Taxes', icon: 'percent', roles: ['admin'] },
  { to: '/discounts', label: 'Discounts', icon: 'tag', roles: ['admin'] },
  { to: '/templates', label: 'Quotation templates', icon: 'doc', roles: TEAM },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'repeat', roles: ['admin', 'staff', 'customer'] },
  { to: '/invoices', label: 'Invoices', icon: 'receipt', roles: ['admin', 'staff', 'customer'] },
  { to: '/payments', label: 'Payments', icon: 'wallet', roles: TEAM },
  { to: '/staff', label: 'Staff', icon: 'people', roles: ['admin'] },
  { to: '/profile', label: 'My details', icon: 'user', roles: ['customer'] },
];

export const navFor = (role) => NAV.filter((item) => item.roles.includes(role));

export const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', customer: 'Customer' };
