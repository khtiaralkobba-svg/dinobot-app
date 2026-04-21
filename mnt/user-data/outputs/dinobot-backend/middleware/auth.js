const jwt = require('jsonwebtoken');

// ── Verify JWT from Authorization header or session ───────────────────────────
function requireAuth(req, res, next) {
  // 1. Try Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.session?.accessToken;   // 2. Fall back to session-stored token

  if (!token) {
    return res.status(401).json({ error: 'No access token provided' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;   // { id, employeeId, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// ── Role guard — call after requireAuth ──────────────────────────────────────
// Usage:  router.get('/manager-only', requireAuth, requireRole('manager'), handler)
//         router.get('/staff',        requireAuth, requireRole('manager','kitchen'), handler)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied — requires role: ${roles.join(' or ')}`,
        yourRole: req.user.role,
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
