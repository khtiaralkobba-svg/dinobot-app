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

// ✅ No hardcoded secrets — will throw early if missing in production
if (nodeEnv === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required in production');
}

module.exports = {
  port,
  nodeEnv,
  allowedOrigins,
  jwt: {
    secret: process.env.JWT_SECRET,         // ❌ no fallback
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  },
  supabase: {
    url:        process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY
  }
};