import { Router } from 'express';
import { apiKeyMiddleware } from '../middlewares/apikey.middleware';
import {
  /* getProductoByCodigo, */
  getProductoByCodigoBarras
  /* getProductos */
} from '../controllers/consulta.controller';

const router = Router();

router.use(apiKeyMiddleware);

/* router.get('/productos',                          getProductos); */
/* router.get('/productos/codigo/:codigo',           getProductoByCodigo); */
router.get('/productos/barras/:codigo_barras',    getProductoByCodigoBarras);

export default router;