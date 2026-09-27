import { Request, Response, NextFunction } from 'express';
import config from '../../../config/config';

export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  const tiendaId = req.headers['x-tienda-id'] as string;

  if (!apiKey || apiKey !== config.consulta_api_key) {
    res.status(401).json({ error: 'API key inválida' });
    return;
  }

  if (!tiendaId || isNaN(parseInt(tiendaId))) {
    res.status(400).json({ error: 'x-tienda-id requerido' });
    return;
  }

  (req as any).tienda_id = parseInt(tiendaId);
  next();
}