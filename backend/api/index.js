import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { getDatabase } from '../src/database/connection.js';
import authRoutes from '../src/routes/authRoutes.js';
import campaignRoutes from '../src/routes/campaignRoutes.js';
import contactRoutes from '../src/routes/contactRoutes.js';
import reportRoutes from '../src/routes/reportRoutes.js';
import simpleEmailRoutes from '../src/routes/simpleEmailRoutes.js';
import serverless from 'serverless-http';

dotenv.config();

const app = express();

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize database
await getDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', simpleEmailRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

export const handler = serverless(app);