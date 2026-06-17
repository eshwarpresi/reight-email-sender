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

// Initialize database with error handling for Vercel
let dbInitialized = false;

async function initDatabase() {
    if (!dbInitialized) {
        try {
            await getDatabase();
            dbInitialized = true;
            console.log('✅ Database connected successfully');
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            // Don't throw - let the app still work for read-only operations
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', simpleEmailRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        database: dbInitialized ? 'connected' : 'not connected'
    });
});

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

// Export handler for Vercel
export const handler = serverless(app);

// For local development
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}