import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestRoute, ProtectedRoute } from './auth/routes.jsx';
import { useAuth } from './auth/AuthContext.jsx';
import AppShell from './layout/AppShell.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Overview from './pages/Overview.jsx';
import Staff from './pages/Staff.jsx';
import Products from './pages/Products.jsx';
import ProductForm from './pages/ProductForm.jsx';
import Plans from './pages/Plans.jsx';
import PlanForm from './pages/PlanForm.jsx';
import Taxes from './pages/Taxes.jsx';
import TaxForm from './pages/TaxForm.jsx';
import Discounts from './pages/Discounts.jsx';
import DiscountForm from './pages/DiscountForm.jsx';
import Templates from './pages/Templates.jsx';
import TemplateForm from './pages/TemplateForm.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import SubscriptionDetail from './pages/SubscriptionDetail.jsx';
import SubscriptionForm from './pages/SubscriptionForm.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceDetail from './pages/InvoiceDetail.jsx';
import Payments from './pages/Payments.jsx';
import Profile from './pages/Profile.jsx';

const TEAM = ['admin', 'staff'];

/** Customers land on their subscriptions; the team lands on the overview. */
function Landing() {
  const { user } = useAuth();
  return user.role === 'customer' ? <Navigate to="/subscriptions" replace /> : <Overview />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>

      {/* The reset link is opened from an email, so it works whether or not someone is signed in. */}
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Landing />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/subscriptions/:id" element={<SubscriptionDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />

          <Route element={<ProtectedRoute roles={TEAM} />}>
            <Route path="/products" element={<Products />} />
            <Route path="/products/new" element={<ProductForm />} />
            <Route path="/products/:id" element={<ProductForm />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/plans/new" element={<PlanForm />} />
            <Route path="/plans/:id" element={<PlanForm />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/templates/new" element={<TemplateForm />} />
            <Route path="/templates/:id" element={<TemplateForm />} />
            <Route path="/subscriptions/new" element={<SubscriptionForm />} />
            <Route path="/subscriptions/:id/edit" element={<SubscriptionForm />} />
            <Route path="/payments" element={<Payments />} />
          </Route>

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/taxes" element={<Taxes />} />
            <Route path="/taxes/new" element={<TaxForm />} />
            <Route path="/taxes/:id" element={<TaxForm />} />
            <Route path="/discounts" element={<Discounts />} />
            <Route path="/discounts/new" element={<DiscountForm />} />
            <Route path="/discounts/:id" element={<DiscountForm />} />
            <Route path="/staff" element={<Staff />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
