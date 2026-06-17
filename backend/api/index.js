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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Handle OPTIONS requests
app.options('*', cors());

// Health check endpoint (before database)
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        message: 'Backend is running on Vercel'
    });
});

// Try to initialize database, but don't fail if it doesn't work
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

// Initialize database on first request
app.use(async (req, res, next) => {
    if (!dbInitialized) {
        await initDatabase();
    }
    next();
});

// Routes - IMPORTANT: Import queueService ONLY when needed, not at startup
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', simpleEmailRoutes);

// 404 handler
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ 
        success: false, 
        message: err.message || 'Internal server error' 
    });
});

// Export handler for Vercel - ensure it's a function
export const handler = serverless(app);