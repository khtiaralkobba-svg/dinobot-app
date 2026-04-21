const orderService = require('../services/orderService');
const socket = require('../socket');          // ← new
 
async function createOrder(req, res) {
  try {
    const order = await orderService.createOrder(req.body);
 
    // Notify all screens: a new order just landed
    socket.broadcast('order:created', { order });
 
    return res.status(201).json({ success: true, order });
  } catch (err) {
    console.error('Create order error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
 
async function getOrder(req, res) {
  try {
    const order = await orderService.getOrderByRef(req.params.orderRef);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    return res.json({ success: true, order });
  } catch (err) {
    console.error('Get order error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
 
async function getOrders(req, res) {
  try {
    const orders = await orderService.getAllOrders();
    return res.json({ success: true, orders });
  } catch (err) {
    console.error('Get orders error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
 
async function updateStatus(req, res) {
  try {
    const result = await orderService.updateOrderStatus(
      req.params.orderRef,
      req.body.status
    );
 
    if (!result) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
 
    const payload = {
      order_ref: req.params.orderRef,
      status: req.body.status,
      prep_started_at: result.prep_started_at || null
    };
 
    // Notify all screens: an order changed status
    socket.broadcast('order:updated', payload);
 
    return res.json({
      success: true,
      message: 'Order status updated',
      ...payload
    });
  } catch (err) {
    console.error('Update order status error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
 
async function cancelOrder(req, res) {
  try {
    const result = await orderService.cancelOrder(req.params.orderRef);
 
    if (!result.ok && result.reason === 'not_found') {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    if (!result.ok && result.reason === 'not_cancellable') {
      return res.status(400).json({
        success: false,
        error: 'Order cannot be cancelled after preparation starts'
      });
    }
 
    const payload = {
      order_ref: req.params.orderRef,
      status: 'cancelled'
    };
 
    // Notify all screens: order was cancelled
    socket.broadcast('order:updated', payload);
 
    return res.json({
      success: true,
      message: 'Order cancelled successfully',
      ...payload
    });
  } catch (err) {
    console.error('Cancel order error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
 
module.exports = { createOrder, getOrder, getOrders, updateStatus, cancelOrder };