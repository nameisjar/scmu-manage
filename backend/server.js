require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');

const { errorHandler } = require('./src/middleware/errorHandler');
const { apiLimiter } = require('./src/middleware/rateLimiter');

const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const companyRoutes = require('./src/routes/companies');
const rfqRoutes = require('./src/routes/rfq');
const shipmentRoutes = require('./src/routes/shipments');
const fleetRoutes = require('./src/routes/fleet');
const driverRoutes = require('./src/routes/drivers');
const invoiceRoutes = require('./src/routes/invoices');
const analyticsRoutes = require('./src/routes/analytics');
const goodsRoutes = require('./src/routes/goods');
const routeRoutes = require('./src/routes/routes');
const reportRoutes = require('./src/routes/reports');
const jobRoutes = require('./src/routes/jobs');
const { router: salesQuotationRoutes } = require('./src/routes/salesQuotations');
const { authenticate, authenticatedUser } = require('./src/middleware/auth');

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGIN, methods: ['GET', 'POST'] },
});
app.set('io', io);

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Global rate limit on all API routes
app.use('/api', apiLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'SCMU API', version: '1.0.0' })
);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/portal', (req, res) => res.status(404).json({ message: 'Customer portal is no longer available' }));
app.use('/api', authenticate);
app.use('/api/jobs', jobRoutes);
app.use('/api/approvals', require('./src/routes/approvals'));
app.use('/api/sales-quotations', salesQuotationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/rfq', rfqRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/goods', goodsRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/reports', reportRoutes);

// NOTE: /uploads is NOT served as static — files are served via authenticated
// endpoint in shipments route to prevent unauthenticated access.

// ── Socket.io: require auth token ────────────────────────────────────────────
io.use(async (socket, next) => {
  try { const user = await authenticatedUser(socket.handshake.auth?.token); if (!user) return next(new Error('Not authorized')); socket.data.userId = user.id; next(); }
  catch { next(new Error('Not authorized')); }
});
io.on('connection', socket => {
  socket.on('join_shipment', async shipmentId => {
    try { if (!await authenticatedUser(socket.handshake.auth?.token)) { socket.disconnect(true); return; }
      if (typeof shipmentId === 'string' && shipmentId.length < 100) socket.join('shipment_' + shipmentId);
    } catch { socket.disconnect(true); }
  });
  socket.on('leave_shipment', shipmentId => { if (typeof shipmentId === 'string') socket.leave('shipment_' + shipmentId); });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n🚛 SCMU API running on port ${PORT}`);
    console.log(`📖 Health check: http://localhost:${PORT}/health\n`);
  }
});

module.exports = { app, io };
