import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../../../config/db';
import { Tienda } from '../../../types/tienda';
import { getOrder } from '../services/woocommerce.service';
import { generateOrderCsvs } from '../services/csv.service';

function verifyWebhook(req: Request, secret: string): boolean {
  const signature = req.headers['x-wc-webhook-signature'] as string;
  if (!signature) return false;

  const payload = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : JSON.stringify(req.body);

  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  // --- LOGS DE DIAGNÓSTICO ---
  console.log('--- DEBUG WEBHOOK ---');
  console.log('1. Es Buffer?:', Buffer.isBuffer(req.body));
  console.log('2. Payload evaluado:', JSON.stringify(payload));
  console.log('3. Hash calculado en API:', hash);
  console.log('4. Firma que mandó Postman:', signature);
  console.log('5. Secreto usado:', secret);
  console.log('---------------------');

  return hash === signature;
}

export function makeWebhookHandler(tienda: Tienda) {
  return async function handleOrderWebhook(req: Request, res: Response): Promise<void> {
    if (!verifyWebhook(req, tienda.wc_webhook_secret)) {
      console.warn(`[WCWebhook][${tienda.nombre}] Firma inválida.`);
      res.status(401).json({ error: 'Firma inválida' });
      return;
    }

    // Parsear el body crudo a JSON
    const payload = Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString('utf8'))
      : req.body;

    res.status(200).json({ received: true });

    try {
      const order_id = payload.id;
      if (!order_id) return;

      if (!['processing', 'completed'].includes(payload.status)) {
        console.log(`[WCWebhook][${tienda.nombre}] Pedido ${order_id} en estado ${payload.status}, ignorando.`);
        return;
      }

      const { rows } = await pool.query(
        'SELECT id FROM woocommerce_orders WHERE tienda_id = $1 AND woocommerce_id = $2',
        [tienda.id, order_id]
      );
      if (rows.length > 0) {
        console.log(`[WCWebhook][${tienda.nombre}] Pedido ${order_id} ya procesado.`);
        return;
      }

      const order = await getOrder(tienda, order_id);
      const dni = order.meta_data?.find(m => m.key === 'billing_dni')?.value ?? null;

      await pool.query(`
        INSERT INTO woocommerce_orders
          (tienda_id, woocommerce_id, customer_email, customer_dni, total, status, payment_method, raw_payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        tienda.id,
        order.id,
        order.billing?.email ?? null,
        dni,
        parseFloat(order.total),
        order.status,
        order.payment_method,
        JSON.stringify(order),
      ]);

      generateOrderCsvs(order, tienda);

      console.log(`[WCWebhook][${tienda.nombre}] Pedido ${order.number} procesado. Pago: ${order.payment_method_title}`);
    } catch (err) {
      console.error(`[WCWebhook][${tienda.nombre}] Error:`, err);
    }
  };
}