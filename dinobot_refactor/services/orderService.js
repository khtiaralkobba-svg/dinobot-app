const { supabase } = require('../db');

function buildOrderRef() {
  return 'ORD-' + Date.now().toString().slice(-6);
}

// ==========================
// CREATE ORDER
// ==========================
async function createOrder({ tableNumber, items, notes }) {
  const orderRef = buildOrderRef();

  const total = items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * Number(item.qty),
    0
  );

  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_ref: orderRef,
      table_number: Number(tableNumber),
      status: 'new',
      total,
      notes: notes || null
    })
    .select('id')
    .single();

  if (orderError) throw orderError;

  const orderId = orderData.id;

  const orderItems = items.map((item) => ({
    order_id: orderId,
    item_id: item.id,
    name: item.name,
    emoji: item.emoji || '🍽️',
    qty: Number(item.qty),
    unit_price: Number(item.unitPrice)
  }));

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems);

  if (itemsError) throw itemsError;

  return {
    id: orderId,
    order_ref: orderRef,
    table_number: Number(tableNumber),
    status: 'new',
    total,
    items
  };
}

// ==========================
// GET ONE ORDER
// ==========================
async function getOrderByRef(orderRef) {
  const { data: orders, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('order_ref', orderRef)
    .limit(1);

  if (orderError) throw orderError;
  if (!orders || orders.length === 0) return null;

  const order = orders[0];

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id);

  if (itemsError) throw itemsError;

  const formattedItems = items.map(item => ({
    id: item.item_id,
    name: item.name,
    emoji: item.emoji,
    qty: item.qty,
    unitPrice: item.unit_price
  }));

  return { ...order, items: formattedItems };
}

// ==========================
// GET ALL ORDERS
// ==========================
async function getAllOrders() {
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .order('placed_at', { ascending: true });

  if (ordersError) throw ordersError;
  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);

  const { data: allItems, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .in('order_id', orderIds);

  if (itemsError) throw itemsError;

  const itemsByOrder = {};
  for (const item of allItems) {
    if (!itemsByOrder[item.order_id]) {
      itemsByOrder[item.order_id] = [];
    }
    itemsByOrder[item.order_id].push({
      id: item.item_id,
      name: item.name,
      emoji: item.emoji,
      qty: item.qty,
      unitPrice: item.unit_price
    });
  }

  return orders.map((order) => ({
    ...order,
    items: itemsByOrder[order.id] || []
  }));
}

// ==========================
// UPDATE STATUS
// ==========================
async function updateOrderStatus(orderRef, status, handledBy = null) {
  const updateData = { 
    status,
    updated_at: new Date().toISOString()
  };

  if (status === 'prep' && handledBy) {
    updateData.handled_by = handledBy;
  }

  if (status === 'delivered') {
    updateData.delivered_at = new Date().toISOString();
  }

  if (status === 'prep') {
    const { data: existing } = await supabase
      .from('orders')
      .select('prep_started_at')
      .eq('order_ref', orderRef)
      .single();

    if (!existing?.prep_started_at) {
      updateData.prep_started_at = new Date().toISOString();
    }
  }

  if (status === 'ready') {
    updateData.ready_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('order_ref', orderRef)
    .select('id, prep_started_at, ready_at, delivered_at, table_number, updated_at');

  if (error) throw error;
  return data?.[0] || null;
}
// ==========================
// CANCEL ORDER
// ==========================
async function cancelOrder(orderRef) {
  const order = await getOrderByRef(orderRef);

  if (!order) return { ok: false, reason: 'not_found' };

  if (order.status !== 'new') {
    return { ok: false, reason: 'not_cancellable' };
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('order_ref', orderRef);

  if (error) throw error;

  return { ok: true };
}

// ==========================
// RESET STUCK ORDERS
// ==========================
async function resetStuckOrders() {
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'ready' })
    .in('status', ['dispatched', 'delivering'])
    .select('order_ref, table_number, status');

  if (error) throw error;
  return data || [];
}
// ==========================
// STUCK ORDERS
// ==========================
async function logStuckOrder({ order_ref, table_number, status_at_reset, reason, reset_by }) {
  const { data, error } = await supabase
    .from('stuck_orders')
    .insert({ order_ref, table_number, status_at_reset, reason, reset_by })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getStuckOrders() {
  const { data, error } = await supabase
    .from('stuck_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data || [];
}

module.exports = {
  createOrder,
  getOrderByRef,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  resetStuckOrders,
  logStuckOrder,
  getStuckOrders
};