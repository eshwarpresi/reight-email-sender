import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../src/database/connection.js';
import authRoutes from '../src/routes/authRoutes.js';
import campaignRoutes from '../src/routes/campaignRoutes.js';
import contactRoutes from '../src/routes/contactRoutes.js';
import reportRoutes from '../src/routes/reportRoutes.js';
import simpleEmailRoutes from '../src/routes/simpleEmailRoutes.js';
import serverless from 'serverless-http';

// Fix dotenv path for Render
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.options('*', cors());

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        brevo_key_set: !!process.env.BREVO_API_KEY,
        smtp_host: process.env.SMTP_HOST || 'not set'
    });
});

// Debug env endpoint
app.get('/api/debug-env', (req, res) => {
    res.json({
        BREVO_API_KEY: process.env.BREVO_API_KEY ? 'SET (length: ' + process.env.BREVO_API_KEY.length + ')' : 'NOT SET',
        SMTP_HOST: process.env.SMTP_HOST || 'NOT SET',
        SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || 'NOT SET',
        NODE_ENV: process.env.NODE_ENV || 'NOT SET',
        PORT: process.env.PORT || 'NOT SET'
    });
});

let dbInitialized = false;

async function initDatabase() {
    if (!dbInitialized) {
        try {
            await getDatabase();
            dbInitialized = true;
            console.log('✅ Database connected successfully');
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
        }
    }
}

app.use(async (req, res, next) => {
    if (!dbInitialized) await initDatabase();
    next();
});

app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', simpleEmailRoutes);

app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: 'API endpoint not found' });
});

app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

export const handler = serverless(app);