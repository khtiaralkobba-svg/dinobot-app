require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');

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
// ── Robot proxy (forwards to local Python server) ─────────────────────────────
const ROBOT_URL = 'http://localhost:5000';

app.post('/api/robot/pickup', async (req, res) => {
  try { await fetch(`${ROBOT_URL}/pickup`, { method: 'POST' }); } catch (err) {}
  res.json({ ok: true });
});

app.post('/api/robot/dispatch', async (req, res) => {
  try {
    const r = await fetch(`${ROBOT_URL}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.json(data);
  } catch (err) { res.status(503).json({ error: 'Robot offline' }); }
});

app.post('/api/robot/recall', async (req, res) => {
  try { await fetch(`${ROBOT_URL}/recall`, { method: 'POST' }); } catch (err) {}
  res.json({ ok: true });
});

app.post('/api/robot/stop', async (req, res) => {
  try { await fetch(`${ROBOT_URL}/stop`, { method: 'POST' }); } catch (err) {}
  res.json({ ok: true });
});

app.post('/api/robot/pause', async (req, res) => {
  try { await fetch(`${ROBOT_URL}/pause`, { method: 'POST' }); } catch (err) {}
  res.json({ ok: true });
});

app.post('/api/robot/resume', async (req, res) => {
  try { await fetch(`${ROBOT_URL}/resume`, { method: 'POST' }); } catch (err) {}
  res.json({ ok: true });
});

app.get('/api/robot/status', async (req, res) => {
  try {
    const r = await fetch(`${ROBOT_URL}/status`);
    const data = await r.json();
    res.json(data);
  } catch (err) { res.status(503).json({ error: 'Robot offline' }); }
});

app.post('/api/robot/manual/start', async (req, res) => {
  try { await fetch(`${ROBOT_URL}/manual/start`, { method: 'POST' }); } catch (err) {}
  res.json({ ok: true });
});

app.post('/api/robot/manual/stop', async (req, res) => {
  try { await fetch(`${ROBOT_URL}/manual/stop`, { method: 'POST' }); } catch (err) {}
  res.json({ ok: true });
});

app.post('/api/robot/manual/move', async (req, res) => {
  try {
    const r = await fetch(`${ROBOT_URL}/manual/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.json(data);
  } catch (err) { res.status(503).json({ error: 'Robot offline' }); }
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

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Dinobot running at http://localhost:${PORT}`);
});