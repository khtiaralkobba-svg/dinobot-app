const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { supabase } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DUMMY_PASSWORD_HASH = '$2b$12$8wJmK3QxC1JwJz4xJ8mQ8.N9mQ0Q2nR0m5QmQk6n4f5o1vQ8mZV3K';

function parseDuration(str) {
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = String(str || '').match(/^(\d+)([smhd])$/);
  if (!match) return 86400000;
  return parseInt(match[1], 10) * units[match[2]];
}

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, employeeId: user.employee_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

async function storeRefreshToken(userId, token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(
    Date.now() + parseDuration(process.env.JWT_REFRESH_EXPIRES_IN || '7d')
  ).toISOString();

  const { error } = await supabase
    .from('refresh_tokens')
    .insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt });

  if (error) throw error;
}

function setCookies(res, accessToken, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('access_token', accessToken, {
    httpOnly: true, secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: parseDuration(process.env.JWT_EXPIRES_IN || '15m'),
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true, secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: parseDuration(process.env.JWT_REFRESH_EXPIRES_IN || '7d'),
    path: '/api/auth/refresh',
  });
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password)
    return res.status(400).json({ error: 'employeeId and password are required' });

  try {
    const normalizedEmployeeId = employeeId.trim().toUpperCase();

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('employee_id', normalizedEmployeeId)
      .eq('is_active', true)
      .limit(1);

    if (error) throw error;

    const user = users?.[0];
    const passwordHashToCheck = user ? user.password_hash : DUMMY_PASSWORD_HASH;
    const validPassword = await bcrypt.compare(password, passwordHashToCheck);

    if (!user || !validPassword)
      return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    await storeRefreshToken(user.id, refreshToken);

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.accessToken = accessToken;

    setCookies(res, accessToken, refreshToken);

    return res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        employeeId: user.employee_id,
        role: user.role,
        fullName: user.full_name,
        station: user.station,
      },
      accessToken,
    });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: 'No refresh token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { data: tokenRows, error: tokenError } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('user_id', payload.id)
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .limit(1);

    if (tokenError) throw tokenError;
    if (!tokenRows?.[0])
      return res.status(403).json({ error: 'Refresh token invalid or expired' });

    const { data: userRows, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', payload.id)
      .eq('is_active', true)
      .limit(1);

    if (userError) throw userError;
    const user = userRows?.[0];
    if (!user) return res.status(403).json({ error: 'User not found or deactivated' });

    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    // Revoke old token
    await supabase
      .from('refresh_tokens')
      .update({ revoked: true })
      .eq('token_hash', tokenHash);

    await storeRefreshToken(user.id, newRefreshToken);

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.accessToken = newAccessToken;

    setCookies(res, newAccessToken, newRefreshToken);

    return res.json({ message: 'Token refreshed', accessToken: newAccessToken });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')
      return res.status(403).json({ error: 'Invalid refresh token' });

    console.error('[auth/refresh]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  const token = req.cookies?.refresh_token;
  try {
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await supabase
        .from('refresh_tokens')
        .update({ revoked: true })
        .eq('token_hash', tokenHash);
    }

    req.session.destroy((err) => {
      if (err) console.error('[auth/logout session]', err);
    });

    res.clearCookie('access_token');
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });

    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[auth/logout]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('users')
      .select('id, employee_id, role, full_name, station, created_at')
      .eq('id', req.user.id)
      .limit(1);

    if (error) throw error;
    if (!rows?.[0]) return res.status(404).json({ error: 'User not found' });

    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('[auth/me]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;