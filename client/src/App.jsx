import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestRoute, ProtectedRoute } from './auth/routes.jsx';
import { useAuth } from './auth/AuthContext.jsx';
import AppShell from './layout/AppShell.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Overview from './pages/Overview.jsx';
import Section from './pages/Section.jsx';
import Staff from './pages/Staff.jsx';
import Products from './pages/Products.jsx';
import ProductForm from './pages/ProductForm.jsx';
import Plans from './pages/Plans.jsx';
import PlanForm from './pages/PlanForm.jsx';

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
          <Route
            path="/subscriptions"
            element={
              <Section
                title="Subscriptions"
                customerTitle="My subscriptions"
                intro="Every subscription, from draft to closed."
                customerIntro="Your subscriptions and where each one stands."
              />
            }
          />
          <Route
            path="/invoices"
            element={
              <Section
                title="Invoices"
                customerTitle="My invoices"
                intro="Confirm, send and print invoices."
                customerIntro="Your invoices and what is still to pay."
              />
            }
          />

          <Route element={<ProtectedRoute roles={TEAM} />}>
            <Route path="/products" element={<Products />} />
            <Route path="/products/new" element={<ProductForm />} />
            <Route path="/products/:id" element={<ProductForm />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/plans/new" element={<PlanForm />} />
            <Route path="/plans/:id" element={<PlanForm />} />
            <Route path="/templates" element={<Section title="Quotation templates" intro="Reusable quotes with a plan and product lines." />} />
            <Route path="/payments" element={<Section title="Payments" intro="Payments recorded against invoices." />} />
          </Route>

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/taxes" element={<Section title="Taxes" intro="Tax rules that are applied automatically." />} />
            <Route path="/discounts" element={<Section title="Discounts" intro="Fixed and percentage discounts with limits." />} />
            <Route path="/staff" element={<Staff />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
