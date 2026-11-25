import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
dotenv.config();

import { errorHandler, notFound } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import statusRouter from './routes/status';
import adminRouter from './routes/admin';
import endpointsRouter from './routes/endpoints';
import dashboardRouter from './routes/dashboard';
import incidentsRouter from './routes/incidents';
import notificationsRouter from './routes/notifications';
import publicStatusRouter from './routes/publicStatus';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(requestLogger);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/endpoints', endpointsRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/public/status', publicStatusRouter);
app.use('/api/status', statusRouter);
app.use('/api/admin', adminRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
