import { Router } from 'express';
import { krService } from '../services/krService';

const router = Router();

router.get('/', (_req, res) => {
  const items = krService.list();
  res.json(items);
});

router.post('/', (req, res) => {
  const { okrId, title, metricName, targetValue, unit } = req.body;
  if (!okrId || !title) {
    return res.status(400).json({ error: 'okrId y title son obligatorios' });
  }
  const kr = krService.create({ okrId, title, metricName, targetValue, unit });
  res.status(201).json(kr);
});

export default router;

