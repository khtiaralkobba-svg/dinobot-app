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

// Get single order (tracking page) — MUST be after /queue-eta
router.get('/:orderRef', getOrder);

// ── Cancel order — PUBLIC, no auth needed (student cancels their own order) ──
router.patch('/:orderRef/cancel', cancelOrder);

// ── Status update with smart auth:
//    - 'cancelled' by status route = allow without auth (student cancel from frontend)
//    - all other statuses = require kitchen/manager auth
router.patch('/:orderRef/status', async (req, res, next) => {
  const { status } = req.body;

    // ← ADD THIS TEMPORARILY
  console.log('[AUTH] x-robot-secret:', req.headers['x-robot-secret']);
  console.log('[AUTH] ROBOT_SECRET env:', process.env.ROBOT_SECRET);
  console.log('[AUTH] match:', req.headers['x-robot-secret'] === process.env.ROBOT_SECRET);

  // Allow robot with secret key
  if (req.headers['x-robot-secret'] === process.env.ROBOT_SECRET) {
    return next();
  }

  // Allow students to cancel via the /status route too (frontend uses this)
  if (status === 'cancelled') {
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