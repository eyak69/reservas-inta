const express = require('express');
const cors = require('cors');
const path = require('path');
process.env.TZ = 'America/Argentina/Buenos_Aires'; // Forzar Zona Horaria Argentina (Regla 8)
require('dotenv').config();
const { ensureDirectories } = require('./utils/dirInit');

// Asegurar infraestructura de archivos antes de arrancar (Regla 14)
ensureDirectories();

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { xssSanitizer } = require('./middlewares/securityMiddleware');

const userRoutes = require('./routes/userRoutes');
const spaceRoutes = require('./routes/spaceRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const authRoutes = require('./routes/authRoutes');
const logRoutes = require('./routes/logRoutes');
const chatRoutes = require('./routes/chatRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Confiar en el proxy inverso (Coolify/Traefik) para obtener la IP real
app.set('trust proxy', 1);

// Middleware de seguridad y utilidad
app.use(helmet({
  contentSecurityPolicy: false, // CSP deshabilitado para permitir CDNs de JS (Google, Fullcalendar)
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // Permite popups cross-origin (Google Sign-In)
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(cors());
app.use(express.json());
app.use(xssSanitizer);

// Limitar de intentos en rutas de Auth (20 intentos / 15 minutos por IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Demasiados intentos desde esta IP. Por seguridad, intente de nuevo en 15 minutos." }
});

// Servir archivos estáticos del frontend y de uploads
// Servir archivos estáticos del frontend y de uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend'), {
  setHeaders: (res, filePath) => {
    // Evitar que el navegador guarde el index.html en caché (temporales)
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

const runMigrations = require('./db/migrate');
const { discoverModels, benchmarkModels } = require('./services/modelDiscovery');
const { initTelegram } = require('./services/telegramService');
const { refreshModels }  = require('./controllers/chatController');
const vectorService = require('./services/vectorService');

// Rutas de la API
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/spaces', spaceRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// Para cualquier otra ruta GET no capturada por las API, devolvemos la SPA del frontend
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Manejador de errores global (Regla 11)
app.use((err, req, res, next) => {
  console.error('[GlobalError]', err);
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Función para iniciar el servidor tras las migraciones
async function startServer() {
  try {
    // Ejecutar migraciones antes de arrancar
    await runMigrations();
    await discoverModels();
    await refreshModels();
    await vectorService.ensureCollection(); // Asegurar infraestructura vectorial
    benchmarkModels(); // sin await — corre en background sin bloquear el arranque
    initTelegram();

    const http = require('http');
    const { Server } = require('socket.io');
    const notificationService = require('./services/notificationService');

    const server = http.createServer(app);
    const io = new Server(server, {
      cors: { origin: "*" }
    });

    // Inicializar servicio de notificaciones
    notificationService.initSocket(io);

    server.listen(PORT, () => {
      console.log(`[Server] ✓ Backend y WebSockets corriendo en el puerto ${PORT}`);
    });
    server.timeout = 120000; 
  } catch (error) {
    console.error('[Server] ✗ Error crítico al iniciar:', error);
    process.exit(1); // Abortar si la DB no está lista
  }
}

startServer();
 
