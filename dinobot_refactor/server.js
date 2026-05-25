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

// ── Menu routes ───────────────────────────────────────────────────────────────
app.get('/api/menu', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('is_available', true)
      .order('cat')
      .order('name');
    if (error) throw error;
    res.json({ items: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/menu', async (req, res) => {
  try {
    const { id, cat, emoji, name, description, price } = req.body;
    const { data, error } = await supabase
      .from('menu_items')
      .insert({ id, cat, emoji, name, description, price, is_available: true })
      .select()
      .single();
    if (error) throw error;
    const io = req.app.get('io');
    if (io) io.emit('menu:updated');
    res.json({ success: true, item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/menu/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: false })
      .eq('id', req.params.id);
    if (error) throw error;
    const io = req.app.get('io');
    if (io) io.emit('menu:updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/menu/:id', async (req, res) => {
  try {
    const { cat, emoji, name, description, price } = req.body;
    const { data, error } = await supabase
      .from('menu_items')
      .update({ cat, emoji, name, description, price })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    const io = req.app.get('io');
    if (io) io.emit('menu:updated');
    res.json({ success: true, item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reports ───────────────────────────────────────────────────────────────────
app.post('/api/reports/generate', async (req, res) => {
  try {
    const { type, date_from, date_to, content, generated_by } = req.body;
    const { data, error } = await supabase
      .from('reports')
      .insert({ type, date_from, date_to, content, generated_by })
      .select()
      .single();
    if (error) throw error;
    const url = `${process.env.APP_URL || `${req.protocol}://${req.get('host')}`}/reports/${data.id}`;
    res.json({ report_id: data.id, url, expires_at: data.expires_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Report not found' });
    if (new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Report expired' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Report viewer page (mobile friendly) ─────────────────────────────────────
app.get('/reports/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).send('<h1>Report not found</h1>');
    if (new Date(data.expires_at) < new Date()) {
      return res.status(410).send('<h1>This report has expired</h1>');
    }
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robot Report — ${data.type}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#020b1a; color:#e2e8f0; font-family:'Segoe UI',sans-serif; padding:24px 16px 60px; }
    .header { border-bottom:1px solid rgba(251,185,36,0.3); padding-bottom:16px; margin-bottom:24px; }
    .tag { font-size:11px; letter-spacing:3px; color:rgba(251,185,36,0.8); text-transform:uppercase; margin-bottom:8px; }
    h1 { font-size:28px; color:#FBB924; margin-bottom:4px; }
    .meta { font-size:12px; color:rgba(180,210,245,0.5); }
    .content { font-size:15px; line-height:1.8; color:#cbd5e1; white-space:pre-wrap; }
    .section { background:rgba(10,25,60,0.8); border:1px solid rgba(96,165,250,0.15); border-left:3px solid #FBB924; padding:16px 20px; margin-bottom:16px; border-radius:2px; }
    .section h2 { font-size:13px; letter-spacing:2px; color:#FBB924; text-transform:uppercase; margin-bottom:10px; }
    .expires { text-align:center; margin-top:32px; font-size:11px; color:rgba(180,210,245,0.3); }
  </style>
</head>
<body>
  <div class="header">
    <div class="tag">// Dinobot Intelligence</div>
    <h1>ROBOT ${data.type.toUpperCase()} REPORT</h1>
    <div class="meta">${data.date_from} → ${data.date_to} &nbsp;·&nbsp; Generated by ${data.generated_by || 'Manager'}</div>
  </div>
  <div class="content">${data.content}</div>
  <div class="expires">This report expires ${new Date(data.expires_at).toLocaleDateString()}</div>
</body>
</html>`);
  } catch (err) {
    res.status(500).send('<h1>Error loading report</h1>');
  }
});

// ── Heatmap ───────────────────────────────────────────────────────────────────
app.get('/api/orders/heatmap', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('placed_at')
      .not('placed_at', 'is', null);
    if (error) throw error;

    const now = new Date();
    const weekAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const days  = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const hours = Array.from({ length: 14 }, (_, i) => i + 8);

    function buildGrid(orders) {
      const grid = {};
      ['MON','TUE','WED','THU','FRI','SAT','SUN'].forEach(d => {
        grid[d] = {};
        hours.forEach(h => grid[d][h] = 0);
      });
      orders.forEach(o => {
        const d = new Date(o.placed_at);
        const day  = days[d.getDay()];
        const hour = d.getHours();
        if (grid[day] && hour >= 8 && hour <= 21) grid[day][hour]++;
      });
      return grid;
    }

    const all   = data;
    const week  = data.filter(o => new Date(o.placed_at) >= weekAgo);
    const month = data.filter(o => new Date(o.placed_at) >= monthAgo);

    res.json({
      heatmap: {
        week:  buildGrid(week),
        month: buildGrid(month),
        all:   buildGrid(all)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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