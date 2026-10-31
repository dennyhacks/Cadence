// One menu per role. `icon` names a glyph in components/Icon.jsx, and `group` puts a divider between sections of the menu.
const TEAM = ['admin', 'staff'];

export const NAV = [
  { to: '/', label: 'Overview', icon: 'home', group: 'home', roles: TEAM, end: true },
  { to: '/products', label: 'Products', group: 'setup', icon: 'box', roles: TEAM },
  { to: '/plans', label: 'Plans', group: 'setup', icon: 'cycle', roles: TEAM },
  { to: '/taxes', label: 'Taxes', group: 'setup', icon: 'percent', roles: ['admin'] },
  { to: '/discounts', label: 'Discounts', group: 'setup', icon: 'tag', roles: ['admin'] },
  { to: '/templates', label: 'Quotation templates', group: 'setup', icon: 'doc', roles: TEAM },
  { to: '/subscriptions', label: 'Subscriptions', group: 'billing', icon: 'repeat', roles: ['admin', 'staff', 'customer'] },
  { to: '/invoices', label: 'Invoices', group: 'billing', icon: 'receipt', roles: ['admin', 'staff', 'customer'] },
  { to: '/payments', label: 'Payments', group: 'billing', icon: 'wallet', roles: TEAM },
  { to: '/staff', label: 'Staff', group: 'account', icon: 'people', roles: ['admin'] },
  { to: '/profile', label: 'My details', group: 'account', icon: 'user', roles: ['customer'] },
];

export const navFor = (role) => NAV.filter((item) => item.roles.includes(role));

export const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', customer: 'Customer' };
