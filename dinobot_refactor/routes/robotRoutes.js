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
        obstacles_avoided: obstacles_avoided || 0,
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

    const totalBatteryUsed     = data.reduce((s, r) => s + (r.battery_used      || 0), 0);
    const totalDispatches      = data.reduce((s, r) => s + (r.dispatches        || 0), 0);
    const totalObstaclesAvoided = data.reduce((s, r) => s + (r.obstacles_avoided || 0), 0);

    res.json({ sessions: data, totalBatteryUsed, totalDispatches, totalObstaclesAvoided });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update obstacle count real time ──────────────────────────────────────────
router.post('/obstacle', (req, res, next) => {
  if (req.headers['x-robot-secret'] === process.env.ROBOT_SECRET) {
    req._robotAuth = true;
    return next();
  }
  authenticateToken(req, res, next);
}, (req, res, next) => {
  if (req._robotAuth) return next();
  authorizeRoles('manager')(req, res, next);
}, async (req, res) => {
  try {
    const { obstacles_avoided } = req.body;
    const { error } = await supabase
      .from('robot_live_stats')
      .update({ obstacles_avoided, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/obstacle', authenticateToken, authorizeRoles('manager'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('robot_live_stats')
      .select('obstacles_avoided')
      .eq('id', 1)
      .single();
    if (error) throw error;
    res.json({ obstacles_avoided: data.obstacles_avoided });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Log manual override ──────────────────────────────────────────────────────
router.post('/manual', authenticateToken, authorizeRoles('manager'), async (req, res) => {
  try {
    const { triggered_by } = req.body;
    const { error } = await supabase
      .from('manual_overrides')
      .insert({ triggered_by: triggered_by || 'manager' });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get manual override count ────────────────────────────────────────────────
router.get('/manual', authenticateToken, authorizeRoles('manager'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('manual_overrides')
      .select('*')
      .order('triggered_at', { ascending: false });
    if (error) throw error;
    res.json({ manual_overrides: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Log obstacle event ────────────────────────────────────────────────────────
router.post('/obstacle-event', (req, res, next) => {
  if (req.headers['x-robot-secret'] === process.env.ROBOT_SECRET) {
    req._robotAuth = true;
    return next();
  }
  authenticateToken(req, res, next);
}, (req, res, next) => {
  if (req._robotAuth) return next();
  authorizeRoles('manager')(req, res, next);
}, async (req, res) => {
  try {
    const { error } = await supabase
      .from('robot_obstacle_events')
      .insert({ triggered_at: req.body.triggered_at || new Date().toISOString() });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get obstacle events ───────────────────────────────────────────────────────
router.get('/obstacle-event', authenticateToken, authorizeRoles('manager'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('robot_obstacle_events')
      .select('*')
      .order('triggered_at', { ascending: false });
    if (error) throw error;
    res.json({ obstacle_events: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;