const express = require('express');
const router = express.Router();

// CORRECT controller names matching orderController.js exports
const {
  createOrder,
  getOrderByRef,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  resetStuckOrders
} = require('../controllers/orderController');

const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/authorize');
const { validateCreateOrder, validateOrderStatus } = require('../middleware/validate');

// ── PUBLIC ROUTES ──

// Create new order (students)
router.post('/', validateCreateOrder, async (req, res) => {
  try {
    const order = await createOrder(req.body);
    const io = req.app.get('io');
    if (io) io.to('kitchen').emit('order:new', order);
    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error('[createOrder]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Queue ETA prediction
router.get('/queue-eta', async (req, res) => {
  try {
    const { ref } = req.query;
    const orders = await getAllOrders();
    const target = orders.find(o => o.order_ref === ref);
    const avgPrep = 8;
    const newOrders = orders.filter(o => o.status === 'new');
    const ordersAhead = target 
      ? newOrders.filter(o => new Date(o.placed_at) < new Date(target.placed_at)).length 
      : 0;
    res.json({
      estimatedMinutes: Math.max(2, (ordersAhead * avgPrep) + avgPrep),
      ordersAhead,
      avgPrep
    });
  } catch (err) {
    res.json({ estimatedMinutes: 8 });
  }
});

// ── PROTECTED ROUTES ──

// Get all orders (kitchen/manager) — BEFORE dynamic routes
router.get('/', authenticateToken, authorizeRoles('manager', 'kitchen'), async (req, res) => {
  try {
    const orders = await getAllOrders();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset stuck orders (manager only)
router.post('/reset-stuck', authenticateToken, authorizeRoles('manager'), async (req, res) => {
  try {
    const updated = await resetStuckOrders();
    res.json({ affected: updated.length, orders: updated.map(o => o.order_ref) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DYNAMIC ROUTES (must be LAST) ──

// Get single order
router.get('/:orderRef', async (req, res) => {
  try {
    const order = await getOrderByRef(req.params.orderRef);
    if (!order) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cancel order
router.patch('/:orderRef/cancel', async (req, res) => {
  try {
    const result = await cancelOrder(req.params.orderRef);
    if (!result.ok) return res.status(400).json({ success: false, error: result.reason });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update status
router.patch('/:orderRef/status', (req, res, next) => {
  if (req.body.status === 'cancelled') return next();
  authenticateToken(req, res, () => {
    authorizeRoles('manager', 'kitchen')(req, res, next);
  });
}, validateOrderStatus, async (req, res) => {
  try {
    const result = await updateOrderStatus(req.params.orderRef, req.body.status);
    const io = req.app.get('io');
    if (io) {
      io.to('kitchen').to('student').emit('order:updated', {
        order_ref: req.params.orderRef,
        status: req.body.status,
        prep_started_at: result?.prep_started_at,
        table_number: result?.table_number
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;