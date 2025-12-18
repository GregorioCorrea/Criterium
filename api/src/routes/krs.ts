import { Router } from 'express';
import { krService } from '../services/krService';

export const krRouter = Router();

krRouter.get('/', (_req, res) => {
  const items = krService.list();
  res.json(items);
});

krRouter.post('/', (req, res) => {
  const { okrId, title, metricName, targetValue, unit } = req.body;
  if (!okrId || !title) {
    return res.status(400).json({ error: 'okrId y title son obligatorios' });
  }
  const kr = krService.create({ okrId, title, metricName, targetValue, unit });
  res.status(201).json(kr);
});
