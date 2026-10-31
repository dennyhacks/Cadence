import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { dashboardQuerySchema, parse } from '../validation/schemas.js';
import { buildDashboard, resolveFilters } from '../services/dashboard.js';

const router = Router();

// The finance dashboard is for the team. Filters: from, to (dates) and plan_id.
router.get('/', requireRole('admin', 'staff'), async (req, res) => {
  const filters = resolveFilters(parse(dashboardQuerySchema, req.query));
  res.json(await buildDashboard(filters));
});

export default router;
