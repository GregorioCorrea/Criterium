import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import okrRouter from './routes/okrs';
import krRouter from './routes/krs';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'criterium-node-mvp' });
});

app.use('/okrs', okrRouter);
app.use('/krs', krRouter);

app.listen(port, () => {
  console.log(`[criterium] API escuchando en puerto ${port}`);
});
