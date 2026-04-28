const port = Number(process.env.PORT || 3001);
const nodeEnv = process.env.NODE_ENV || 'development';

// ✅ Allow multiple origins + fallback
const allowedOrigins = (
  process.env.ALLOWED_ORIGIN ||
  'http://localhost:5500,http://localhost:3000'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const jwt = {
  secret: process.env.JWT_SECRET || 'change_me_now',
  expiresIn: process.env.JWT_EXPIRES_IN || '15m'
};

module.exports = {
  port,
  nodeEnv,
  allowedOrigins,
  jwt
};