import express, { Router } from 'express';
import path from 'path';
import authRoutes from './routes/auth.routes';
import dashboardRoutes from './routes/dashboard.routes';

export function setupDashboard(app: Router): void {
  // Servir archivos estáticos del dashboard
  app.use('/dashboard', express.static(path.join(__dirname, 'public')));

  // Rutas de auth
  app.use('/dashboard/auth', authRoutes);

  // Rutas protegidas de la API
  app.use('/dashboard/api', dashboardRoutes);

  console.log('[Dashboard] Módulo iniciado en /dashboard');
}