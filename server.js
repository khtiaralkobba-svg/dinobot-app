require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const { supabase } = require('./db');
const appConfig = require('./config/app');
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || appConfig.port;

const io = new Server(server, {
  cors: { origin: appConfig.allowedOrigins, credentials: true }
});

app.set('io', io);

app.use(cors({ origin: appConfig.allowedOrigins, credentials: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

// ── Groq proxy ────────────────────────────────────────────
app.post('/api/groq', async (req, res) => {
  try {
    const { message, system } = req.body;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 400,
        temperature: 0.7,
        messages: [
          { role: 'system', content: system || 'You are a helpful assistant' },
          ...(Array.isArray(message) ? message : [{ role: 'user', content: message }])
        ]
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[groq] API error:', errorText);
      return res.status(500).json({ error: 'Groq API failed' });
    }
    const data = await response.json();
    res.json({ reply: data.choices?.[0]?.message?.content || 'No response' });
  } catch (err) {
    console.error('[groq] Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Staff management routes ───────────────────────────────
app.get('/api/auth/staff', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, employee_id, role, is_disabled, last_login, orders_handled')
      .in('role', ['kitchen', 'manager'])
      .order('full_name');
    if (error) throw error;
    res.json({ staff: data || [] });
  } catch (err) {
    console.error('[staff] GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/auth/staff/:id/status', async (req, res) => {
  try {
    const { disabled } = req.body;
    const { error } = await supabase
      .from('users')
      .update({ is_disabled: disabled })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[staff] PATCH status error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/auth/staff/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[staff] DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Socket.IO ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[socket] client connected:', socket.id);

  socket.on('join', (room) => {
    socket.join(room);
    console.log(`[socket] ${socket.id} joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log('[socket] client disconnected:', socket.id);
  });
});

// ── 404 + error handler ───────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) return next(err);
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// ── Start ─────────────────────────────────────────────────
async function start() {
  try {
    console.log('Dinobot Backend — starting up...');
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) throw new Error(`Supabase connection failed: ${error.message}`);
    console.log('✓ Supabase connected');
    server.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

start();