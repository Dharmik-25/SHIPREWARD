import { Router, Request, Response } from 'express';
import { BitrefillService, BITREFILL_CATALOG } from '../services/bitrefill.service';

export const bitrefillRouter = Router();

bitrefillRouter.get('/bitrefill/products', (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const country = (req.query.country as string) || 'IN';

  if (query) {
    res.json(BitrefillService.searchProducts(query, country));
  } else {
    res.json(BITREFILL_CATALOG);
  }
});

bitrefillRouter.get('/bitrefill/products/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const product = BitrefillService.getProductDetails(id);
  if (!product) {
    res.status(404).json({ error: 'Product not found in Bitrefill catalog' });
    return;
  }
  res.json(product);
});

bitrefillRouter.get('/bitrefill/health', async (req: Request, res: Response) => {
  const health = await BitrefillService.checkConnectionHealth();
  res.json(health);
});
