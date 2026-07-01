import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../../config/config';

export async function login(req: Request, res: Response): Promise<void> {
  const { password } = req.body;

  if (password !== config.dashboard_password) {
    res.status(401).json({ error: 'Contraseña incorrecta' });
    return;
  }

  const token = jwt.sign(
    { dashboard: true },
    config.dashboard_secret,
    { expiresIn: '8h' }
  );

  res.json({ token });
}