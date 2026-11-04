import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { healthRouter } from './routes/health.routes';
import { programmeRouter } from './routes/programme.routes';
import { contributionRouter } from './routes/contribution.routes';
import { rewardRouter } from './routes/reward.routes';
import { bitrefillRouter } from './routes/bitrefill.routes';
import { auditRouter } from './routes/audit.routes';
import { webhookRouter } from './routes/webhook.routes';

dotenv.config();

export const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// Express middleware to capture raw body buffer for GitHub webhook HMAC verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// API Routes
app.use('/api', healthRouter);
app.use('/api', programmeRouter);
app.use('/api', contributionRouter);
app.use('/api', rewardRouter);
app.use('/api', bitrefillRouter);
app.use('/api', auditRouter);
app.use('/api', webhookRouter);

