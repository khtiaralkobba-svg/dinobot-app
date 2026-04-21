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
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/authorize');
const validate = require('../middleware/validate');

const orderService = require('../services/orderService');

// ==========================
// PUBLIC ROUTES
// ==========================

// Create new order (students don't need auth)
router.post('/', validate.validateCreateOrder, createOrder);

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

  // Allow students to cancel via the /status route too (frontend uses this)
  if (status === 'cancelled') {
    return next(); // skip auth, go straight to updateStatus
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