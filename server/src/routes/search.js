import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { searchAll } from '../services/search.js';

const router = Router();

// Search is for the team. Anything under two characters returns nothing instead of the whole database.
router.get('/', requireRole('admin', 'staff'), async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
  res.json({ results: q.length < 2 ? [] : await searchAll(q) });
});

export default router;
