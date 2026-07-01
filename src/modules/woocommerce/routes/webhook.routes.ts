import { Router } from 'express';
import { pool } from '../../../config/db';
import { Tienda } from '../../../types/tienda';
import { makeWebhookHandler } from '../controllers/webhook.controller';

const router = Router();

export async function registerWebhookRoutes(app: Router): Promise<void> {
  const { rows: tiendas } = await pool.query<Tienda>(
    'SELECT * FROM tiendas WHERE activo = TRUE'
  );

  for (const tienda of tiendas) {
    const route = `/api/woocommerce/${tienda.id}/webhook/orders`;
    app.post(route, makeWebhookHandler(tienda));
    console.log(`[Webhook] Ruta registrada: POST ${route}`);
  }
}

export default router;