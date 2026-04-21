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

// ✅ PORT
const PORT = process.env.PORT || appConfig.port;

// ✅ Socket.IO
const io = new Server(server, {
  cors: {
    origin: appConfig.allowedOrigins,
    credentials: true
  }
});

app.set('io', io);

// ✅ Middleware
app.use(cors({
  origin: appConfig.allowedOrigins,
  credentials: true
}));

app.use(express.json());

// ✅ Serve frontend
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

// ✅ Existing routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);


// 🔥 GROQ ROUTE (IMPORTANT)
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
        model: 'llama3-70b-8192',
        messages: [
          { role: 'system', content: system || 'You are a helpful assistant' },
          ...(Array.isArray(message)
            ? message
            : [{ role: 'user', content: message }])
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', errorText);
      return res.status(500).json({ error: 'Groq API failed' });
    }

    const data = await response.json();

    res.json({
      reply: data.choices?.[0]?.message?.content || 'No response'
    });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ✅ Socket events
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

// ✅ 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ✅ Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) return next(err);

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// ✅ Start server
async function start() {
  try {
    console.log('Dinobot Backend — starting up...');

    const { error } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      throw new Error(`Supabase connection failed: ${error.message}`);
    }

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