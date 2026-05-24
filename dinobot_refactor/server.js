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
app.use(express.static(path.join(__dirname)));

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
const robotRouter = require('./routes/robotRoutes');
app.use('/api/robot-stats', robotRouter);

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
        max_tokens: 3000,
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
// ── Robot proxy routes ────────────────────────────────────────────────────────
const ROBOT_URL = process.env.ROBOT_URL || 'http://localhost:5000';

// ── Table layout ──────────────────────────────────────────────────────────────
let tableLayout = null;

const { supabase } = require('./db');

app.get('/api/tables/layout', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('table_layout')
      .select('tables')
      .eq('id', 1)
      .single();
    if (error) throw error;
    res.json({ tables: data.tables });
  } catch (err) {
    res.json({ tables: [
      {id:1,x:0.55,y:0.18},{id:2,x:0.72,y:0.28},{id:3,x:0.82,y:0.50},{id:4,x:0.72,y:0.72},
      {id:5,x:0.55,y:0.82},{id:6,x:0.38,y:0.82},{id:7,x:0.28,y:0.72},{id:8,x:0.28,y:0.28}
    ]});
  }
});

app.post('/api/tables/layout', async (req, res) => {
  try {
    const { error } = await supabase
      .from('table_layout')
      .upsert({ id: 1, tables: req.body.tables, updated_at: new Date().toISOString() });
    if (error) throw error;
    const io = req.app.get('io');
    if (io) io.emit('tables:updated', { tables: req.body.tables });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const robotProxyRoutes = [
  { path: '/pickup',       method: 'POST' },
  { path: '/dispatch',     method: 'POST' },
  { path: '/recall',       method: 'POST' },
  { path: '/stop',         method: 'POST' },
  { path: '/pause',        method: 'POST' },
  { path: '/resume',       method: 'POST' },
  { path: '/status',       method: 'GET'  },
  { path: '/manual/start', method: 'POST' },
  { path: '/manual/stop',  method: 'POST' },
  { path: '/manual/move',  method: 'POST' },
  { path: '/obstacles', method: 'POST' },
];

robotProxyRoutes.forEach(({ path: robotPath, method }) => {
  app[method.toLowerCase()]('/api/robot' + robotPath, async (req, res) => {
    try {
      const response = await fetch(ROBOT_URL + robotPath, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: method === 'POST' ? JSON.stringify(req.body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      res.status(response.status).json(data);
    } catch (err) {
      res.status(502).json({ error: 'Robot server unreachable' });
    }
  });
});
// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('[socket] connected:', socket.id);

  let _staffId = null;

  socket.on('join', room => {
    socket.join(room);
    console.log(`[socket] ${socket.id} joined: ${room}`);
  });

  socket.on('staff:login', (employeeId) => {
    _staffId = employeeId;
    socket.join('manager');
    io.to('manager').emit('staff:online', employeeId);
    console.log(`[socket] staff online: ${employeeId}`);
  });

  socket.on('disconnect', reason => {
    console.log('[socket] disconnected:', socket.id, reason);
    if (_staffId) {
      io.to('manager').emit('staff:offline', _staffId);
      console.log(`[socket] staff offline: ${_staffId}`);
    }
  });
});

app.set('io', io);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Dinobot running at http://localhost:${PORT}`);
});