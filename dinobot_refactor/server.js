require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const fetch = require('node-fetch');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST','PATCH','DELETE'] }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());

// ── Serve index.html ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// ── Auth routes ───────────────────────────────────────────────────────────────
const {
  login,
  logout,
  me,
  registerStaff,
  getStaff,
  updateStaffStatus,
  deleteStaff
} = require('./controllers/authController');

app.post  ('/api/auth/login',            login);
app.post  ('/api/auth/logout',           logout);
app.get   ('/api/auth/me',               me);
app.post  ('/api/auth/register',         registerStaff);
app.get   ('/api/auth/staff',            getStaff);
app.patch ('/api/auth/staff/:id/status', updateStaffStatus);
app.delete('/api/auth/staff/:id',        deleteStaff);

// ── Orders routes ─────────────────────────────────────────────────────────────
const ordersRouter = require('./routes/orderRoutes');
app.use('/api/orders', ordersRouter);

// ── Groq AI chat ──────────────────────────────────────────────────────────────
app.post('/api/groq', async (req, res) => {
  try {
    const { message, system } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages:    [{ role: 'system', content: system }, ...message],
        max_tokens:  500,
        temperature: 0.8
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq API error:', JSON.stringify(data));
      return res.status(500).json({ reply: 'Sorry, try again!', error: data });
    }

    const reply = data.choices?.[0]?.message?.content || 'Sorry, try again!';
    return res.json({ reply });
  } catch (err) {
    console.error('Groq error:', err);
    return res.status(500).json({ error: 'Groq API failed' });
  }
});
// ── Robot proxy (so mobile clients don't need localhost:5000) ────────────────
app.post('/api/robot/pickup', async (req, res) => {
  try {
    await fetch('http://localhost:5000/pickup', { method: 'POST' });
  } catch (err) {
    console.log('[robot proxy] robot offline:', err.message);
  }
  res.json({ ok: true });
});
// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('[socket] connected:', socket.id);

  socket.on('join', room => {
    socket.join(room);
    console.log(`[socket] ${socket.id} joined: ${room}`);
  });

  socket.on('disconnect', reason => {
    console.log('[socket] disconnected:', socket.id, reason);
  });
});

app.set('io', io);