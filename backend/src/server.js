import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Import modules
import { getDatabase, closeDatabase } from './database/connection.js';
import logger, { stream } from './utils/logger.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/authRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import simpleEmailRoutes from './routes/simpleEmailRoutes.js';
import queueService from './services/queueService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy - Required for rate limiter behind Render's proxy
app.set('trust proxy', 1);

// Security middleware - configure helmet to allow CORS
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS configuration - Allow all origins for production
const allowedOrigins = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',') 
    : ['http://localhost:5173', 'https://mailbolt-email-sender.netlify.app'];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        callback(null, true);
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Compression
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/logs', express.static(path.join(__dirname, '../logs')));

// Global rate limiter
app.use('/api/', apiLimiter);

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        origin: req.headers.origin
    });
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', simpleEmailRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
            return res.status(413).json({
                success: false,
                message: 'File too large'
            });
        }
    }
    
    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
});

// Create required directories
const directories = [
    process.env.UPLOAD_PATH || './uploads',
    process.env.LOG_PATH || './logs'
];

directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Start server
let server;
let queueInterval;

async function startServer() {
    try {
        // Initialize database
        await getDatabase();
        logger.info('Database connected successfully');
        
        // Start server - Bind to 0.0.0.0 for Render compatibility
        server = app.listen(PORT, '0.0.0.0', () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV}`);
            logger.info(`API available at http://0.0.0.0:${PORT}/api`);
            logger.info(`CORS enabled for all origins`);
        });
        
        // FORCE QUEUE PROCESSOR TO START - IMMEDIATELY
        console.log('🔧 Starting queue processor...');
        
        // First check after 3 seconds
        setTimeout(async () => {
            console.log('⏰ First queue check...');
            try {
                await queueService.processQueue();
                console.log('✅ First queue check completed');
            } catch (error) {
                console.error('❌ First queue check failed:', error.message);
            }
        }, 3000);
        
        // CONTINUOUS QUEUE PROCESSING - Check every 10 seconds
        queueInterval = setInterval(async () => {
            try {
                const pending = await queueService.getPendingCount();
                if (pending > 0) {
                    console.log(`📧 ${pending} emails pending, processing...`);
                    await queueService.processQueue();
                }
            } catch (error) {
                console.error('❌ Queue interval error:', error.message);
            }
        }, 10000);
        
        console.log('✅ Queue processor scheduled to run every 10 seconds');
        
        // Graceful shutdown
        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);
        
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

async function gracefulShutdown() {
    logger.info('Received shutdown signal, closing gracefully...');
    
    // Clear queue interval
    if (queueInterval) {
        clearInterval(queueInterval);
        queueInterval = null;
    }
    
    if (server) {
        server.close(async () => {
            logger.info('HTTP server closed');
            queueService.stopProcessor();
            await closeDatabase();
            logger.info('Database connection closed');
            process.exit(0);
        });
        
        setTimeout(() => {
            logger.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
    }
}

// Start the server
startServer();

export default app;