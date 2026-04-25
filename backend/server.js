const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { xssSanitizer } = require('./middlewares/securityMiddleware');

const userRoutes = require('./routes/userRoutes');
const spaceRoutes = require('./routes/spaceRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const authRoutes = require('./routes/authRoutes');
const logRoutes = require('./routes/logRoutes');
const chatRoutes = require('./routes/chatRoutes');

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

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

const runMigrations = require('./db/migrate');
const { discoverModels, benchmarkModels } = require('./services/modelDiscovery');
const { refreshModels }  = require('./controllers/chatController');
const vectorService = require('./services/vectorService');

// Rutas de la API
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/spaces', spaceRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/chat', chatRoutes);

// Para cualquier otra ruta GET no capturada por las API, devolvemos la SPA del frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
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

    app.listen(PORT, () => {
      console.log(`[Server] ✓ Backend corriendo en el puerto ${PORT}`);
    });
  } catch (error) {
    console.error('[Server] ✗ Error crítico al iniciar:', error);
    process.exit(1); // Abortar si la DB no está lista
  }
}

startServer();
 
