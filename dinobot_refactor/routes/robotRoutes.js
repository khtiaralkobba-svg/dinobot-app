const express = require('express');
const router  = express.Router();
const { supabase } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles }    = require('../middleware/authorize');

// ── Log e-stop event ─────────────────────────────────────────────────────────
router.post('/estop', authenticateToken, authorizeRoles('manager'), async (req, res) => {
  try {
    const { triggered_by, duration_seconds } = req.body;
    const { error } = await supabase
      .from('robot_estop_events')
      .insert({ triggered_by: triggered_by || 'manager', duration_seconds: duration_seconds || 0 });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[robot/estop]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Get e-stop events ────────────────────────────────────────────────────────
router.get('/estop', authenticateToken, authorizeRoles('manager'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('robot_estop_events')
      .select('*')
      .order('triggered_at', { ascending: false });
    if (error) throw error;
    res.json({ estop_events: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Save/update robot session ────────────────────────────────────────────────
router.post('/session', authenticateToken, authorizeRoles('manager'), async (req, res) => {
  try {
    const { battery_start, battery_end, battery_used, dispatches } = req.body;
    const { error } = await supabase
      .from('robot_sessions')
      .insert({
        battery_start,
        battery_end,
        battery_used: battery_used || 0,
        dispatches:   dispatches   || 0,
        session_end:  new Date().toISOString()
      });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[robot/session]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Get all sessions summary ─────────────────────────────────────────────────
router.get('/session', authenticateToken, authorizeRoles('manager'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('robot_sessions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const totalBatteryUsed = data.reduce((s, r) => s + (r.battery_used || 0), 0);
    const totalDispatches  = data.reduce((s, r) => s + (r.dispatches  || 0), 0);

    res.json({ sessions: data, totalBatteryUsed, totalDispatches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;