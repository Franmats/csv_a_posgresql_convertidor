import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  getStatus,
  getErrores,
  getPedidos,
  getProductosError,
} from '../controllers/dashboard.controller';

const router = Router();

router.use(authMiddleware);

router.get('/status', getStatus);
router.get('/errores', getErrores);
router.get('/pedidos', getPedidos);
router.get('/tiendas/:tienda_id/errores', getProductosError);

export default router;