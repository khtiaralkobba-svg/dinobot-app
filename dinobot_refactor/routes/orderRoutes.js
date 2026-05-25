const express = require('express');
const router = express.Router();

// Controllers
const {
  createOrder,
  getOrder,
  getOrders,
  updateStatus,
  cancelOrder
} = require('../controllers/orderController');

// Middleware
const { authenticateToken, authenticateTokenOrRobot } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/authorize');
const validate = require('../middleware/validate');

const orderService = require('../services/orderService');

// ==========================
// PUBLIC ROUTES
// ==========================

// Create new order (students don't need auth)
router.post('/', validate.validateCreateOrder, createOrder);

// ── Reset stuck dispatched/delivering orders ──
router.post(
  '/reset-stuck',
  authenticateToken,
  authorizeRoles('manager'),
  async (req, res) => {
    try {
      const updated = await orderService.resetStuckOrders();
      res.json({ affected: updated.length, orders: updated.map(o => o.order_ref) });
    } catch (err) {
      console.error('[reset-stuck]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── Log stuck order to stuck_orders table ──
router.post(
  '/stuck',
  authenticateToken,
  authorizeRoles('manager'),
  async (req, res) => {
    const { order_ref, table_number, reason, status_at_reset } = req.body;
    if (!order_ref) return res.status(400).json({ error: 'order_ref required' });

    try {
      await orderService.logStuckOrder({
        order_ref,
        table_number,
        status_at_reset,
        reason: reason || 'Manual reset',
        reset_by: req.user?.employee_id || req.user?.employeeId || 'unknown'
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[stuck insert]', err);
      res.status(500).json({ error: 'Failed to log stuck order' });
    }
  }
);

// ── View stuck orders log ──
router.get(
  '/stuck',
  authenticateToken,
  authorizeRoles('manager'),
  async (req, res) => {
    try {
      const rows = await orderService.getStuckOrders();
      res.json({ stuck_orders: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);
// ── Get ALL orders (manager analytics — no pagination) ──
router.get(
  '/all',
  authenticateToken,
  authorizeRoles('manager'),
  async (req, res) => {
    try {
      const orders = await orderService.getAllOrders();
      res.json({ orders });
    } catch (err) {
      console.error('[/all]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── Heatmap data ──
router.get(
  '/heatmap',
  authenticateToken,
  authorizeRoles('manager'),
  async (req, res) => {
    try {
      const { supabase } = require('../db');
      const now = new Date();
      const startOfWeek = new Date(now);
startOfWeek.setUTCHours(0, 0, 0, 0);
startOfWeek.setUTCDate(startOfWeek.getUTCDate() - ((startOfWeek.getUTCDay() + 6) % 7));
const weekAgo = startOfWeek;
      const monthAgo = new Date(now - 30 * 24*60*60*1000);

      const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
      const hours = Array.from({length:14}, (_,i) => i + 8);

      const data = { week: {}, month: {}, all: {} };
      days.forEach(d => {
        data.week[d] = {}; data.month[d] = {}; data.all[d] = {};
        hours.forEach(h => { data.week[d][h]=0; data.month[d][h]=0; data.all[d][h]=0; });
      });

      // Fetch only needed fields, no items needed, paginate through all
      let allOrders = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data: batch, error } = await supabase
          .from('orders')
          .select('placed_at, status')
          .neq('status', 'cancelled')
          .order('placed_at', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!batch || batch.length === 0) break;
        allOrders = allOrders.concat(batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      console.log('[heatmap] total fetched:', allOrders.length);

     allOrders.forEach(order => {
        const date = new Date(order.placed_at);
        const day  = days[date.getUTCDay()];
        const hour = date.getUTCHours() + 3;
        const finalHour = hour > 23 ? hour - 24 : hour;
        if (!day || finalHour < 8 || finalHour > 21) return;
        data.all[day][finalHour]++;
        if (date >= monthAgo) data.month[day][finalHour]++;
        if (date >= weekAgo)  data.week[day][finalHour]++;
   });
      res.json({ heatmap: data });
    } catch(err) {
      console.error('[heatmap]', err);
      res.status(500).json({ error: err.message });
    }
  }
);
// ── Queue ETA prediction — MUST be before /:orderRef ──
router.get('/queue-eta', async (req, res) => {
  try {
    const { ref } = req.query;
    const orders = await orderService.getAllOrders();

    const target = orders.find(o => o.order_ref === ref);
    if (!target) return res.json({ estimatedMinutes: 8 });

    const newOrders = orders.filter(o => o.status === 'new');
    const prepOrders = orders.filter(o => o.status === 'prep');

    const completedOrders = orders.filter(o =>
      o.prep_started_at && ['ready','dispatched','delivering','delivered'].includes(o.status)
    );
    const avgPrep = completedOrders.length > 0
      ? completedOrders.reduce((sum, o) => {
          const mins = (new Date(o.updated_at) - new Date(o.prep_started_at)) / 60000;
          return sum + (mins > 0 && mins < 60 ? mins : 8);
        }, 0) / completedOrders.length
      : 8;

    const ordersAhead = newOrders.filter(o =>
      new Date(o.placed_at) < new Date(target.placed_at)
    ).length;

    const prepBurden = prepOrders.reduce((sum, o) => {
      if (!o.prep_started_at) return sum + avgPrep;
      const elapsed = (Date.now() - new Date(o.prep_started_at)) / 60000;
      const remaining = Math.max(0, avgPrep - elapsed);
      return sum + remaining;
    }, 0);

    const estimatedMinutes = Math.round(
      (ordersAhead * avgPrep) + (prepBurden / Math.max(1, prepOrders.length)) + avgPrep
    );

    res.json({
      estimatedMinutes: Math.max(2, estimatedMinutes),
      ordersAhead,
      avgPrep: Math.round(avgPrep * 10) / 10
    });
  } catch (err) {
    console.error('[queue-eta]', err);
    res.json({ estimatedMinutes: 8 });
  }
});

// ── Item leaderboard ──
router.get(
  '/item-stats',
  authenticateToken,
  authorizeRoles('manager'),
  async (req, res) => {
    try {
      const { supabase } = require('../db');
      const { data, error } = await supabase
        .from('order_items')
        .select('item_id, name, emoji, qty, unit_price');
      if (error) throw error;

      const stats = {};
      (data || []).forEach(item => {
        if (!stats[item.item_id]) {
          stats[item.item_id] = { id: item.item_id, name: item.name, emoji: item.emoji, qty: 0, revenue: 0, orders: 0 };
        }
        stats[item.item_id].qty += item.qty;
        stats[item.item_id].revenue += item.qty * item.unit_price;
        stats[item.item_id].orders++;
      });

      const sorted = Object.values(stats).sort((a, b) => b.qty - a.qty);
      res.json({ items: sorted });
    } catch(err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Get single order (tracking page) — MUST be after /queue-eta
router.get('/:orderRef', getOrder);

// ── Cancel order — PUBLIC, no auth needed (student cancels their own order) ──
router.patch('/:orderRef/cancel', cancelOrder);

// ── Status update with smart auth:
//    - 'cancelled' by status route = allow without auth (student cancel from frontend)
//    - all other statuses = require kitchen/manager auth
router.patch('/:orderRef/status', async (req, res, next) => {
  const { status } = req.body;

  if (req.headers['x-robot-secret'] === process.env.ROBOT_SECRET) {
    return next();
  }

  // Allow students to cancel via the /status route too (frontend uses this)
  if (status === 'cancelled' || status === 'delivered') {
    return next();
  }

  // All other status changes require kitchen/manager auth
  authenticateToken(req, res, () => {
    authorizeRoles('manager', 'kitchen')(req, res, next);
  });
}, validate.validateOrderStatus, updateStatus);

// ==========================
// PROTECTED ROUTES (Kitchen & Manager)
// ==========================

// Get all orders (kitchen screen)
router.get(
  '/',
  authenticateToken,
  authorizeRoles('manager', 'kitchen'),
  getOrders
);

module.exports = router;