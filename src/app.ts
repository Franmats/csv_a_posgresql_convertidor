import express, { Router } from 'express';
import config from './config/config';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { pool } from './config/db';
import { testConnection } from './config/db';
import { Tienda } from './types/tienda';
import { startCsvWatchers } from './modules/csvwatcher/index';
import { startWCWorkers } from './modules/woocommerce/workers/woocommerce.worker';
import { registerWebhookRoutes } from './modules/woocommerce/routes/webhook.routes';
import { setupDashboard } from './modules/dashboard/index';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = express();

  app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", "'unsafe-inline'"],
      'script-src-attr': ["'unsafe-inline'"],
    }
  }
}));
  app.use(cors({
    origin: (origin, callback) => { callback(null, true); },
    credentials: true,
  }));
app.use('/api/woocommerce', express.raw({ type: 'application/json' }));
  app.use(express.json());

  // ── Imágenes por tienda ───────────────────────────────────
  const imageLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });

  const { rows: tiendas } = await pool.query<Tienda>(
    'SELECT * FROM tiendas WHERE activo = TRUE'
  );

  for (const tienda of tiendas) {
    app.use(`/api/imagenes/${tienda.id}`,
      imageLimit,
      (req, res, next) => {
        const ext = path.extname(req.path).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          return res.status(403).json({ error: 'Tipo no permitido' });
        }
        next();
      },
      express.static(tienda.images_dir)
    );
    console.log(`[Imagenes] Ruta registrada: /api/imagenes/${tienda.id} → ${tienda.images_dir}`);
  }

  // ── Webhooks por tienda ───────────────────────────────────
  const router = Router();
  await registerWebhookRoutes(router);
  app.use(router);
app.use(cookieParser());

  app.get('/', (req, res) => res.send('Sistema activo'));

  await testConnection();

  // ── Arrancar módulos ──────────────────────────────────────
  await startCsvWatchers();
  await startWCWorkers();
setupDashboard(app);
  app.listen(config.port, () => {
    console.log(`Servidor corriendo en http://localhost:${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Error al iniciar la app:', err);
  process.exit(1);
});