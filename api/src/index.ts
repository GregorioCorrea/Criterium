import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import okrRouter from './routes/okrs';
import krRouter from './routes/krs';
import { requireAuth } from "./middleware/auth";



const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(morgan('dev'));
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'criterium-node-mvp' });
});

app.get("/whoami", requireAuth, (req, res) => {
  res.json({
    tenantId: req.tenantId,
    userId: req.userId
  });
});

app.use('/okrs', okrRouter);
app.use('/krs', krRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("API error:", err);
  res.status(500).json({ error: "internal_error", message: err?.message ?? String(err) });
});


app.listen(port, () => {
  console.log(`[criterium] API escuchando en puerto ${port}`);
});
