import { Router } from 'express';
import { okrService } from '../services/okrService';

export const okrRouter = Router();

okrRouter.get('/', (_req, res) => {
  const items = okrService.list();
  res.json(items);
});

okrRouter.post('/', (req, res) => {
  const { objective, fromDate, toDate } = req.body;
  if (!objective || !fromDate || !toDate) {
    return res.status(400).json({ error: 'objective, fromDate y toDate son obligatorios' });
  }
  const okr = okrService.create({ objective, fromDate, toDate });
  res.status(201).json(okr);
});
