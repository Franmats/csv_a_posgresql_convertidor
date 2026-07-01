import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../../config/config';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.split(' ')[1]
    ?? req.cookies?.dashboard_token;

  if (!token) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  try {
    jwt.verify(token, config.dashboard_secret);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}