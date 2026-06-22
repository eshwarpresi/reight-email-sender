import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';

// Load environment variables
dotenv.config();

// Import modules
import { getDatabase, closeDatabase } from './database/connection.js';
import logger from './utils/logger.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/authRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import simpleEmailRoutes from './routes/simpleEmailRoutes.js';
import queueService from './services/queueService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors({
    origin: function (origin, callback) {
        callback(null, true);
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));
app.options('*', cors());

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/', apiLimiter);

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.headers['user-agent']
    });
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        brevo_key: process.env.BREVO_API_KEY ? 'SET' : 'NOT SET',
        smtp_host: process.env.SMTP_HOST || 'not set'
    });
});

// DEBUG - Check environment variables
app.get('/api/debug-env', (req, res) => {
    res.json({
        BREVO_API_KEY: process.env.BREVO_API_KEY ? 'SET (' + process.env.BREVO_API_KEY.length + ' chars)' : 'NOT SET',
        SMTP_HOST: process.env.SMTP_HOST || 'NOT SET',
        SMTP_USER: process.env.SMTP_USER ? 'SET' : 'NOT SET',
        SMTP_PASSWORD: process.env.SMTP_PASSWORD ? 'SET' : 'NOT SET',
        SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || 'NOT SET',
        SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || 'NOT SET',
        NODE_ENV: process.env.NODE_ENV || 'NOT SET',
        PORT: process.env.PORT || 'NOT SET'
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', simpleEmailRoutes);

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'API endpoint not found' });
});

app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
            return res.status(413).json({ success: false, message: 'File too large' });
        }
    }
    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
});

const directories = [process.env.UPLOAD_PATH || './uploads', process.env.LOG_PATH || './logs'];
directories.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let server;
let queueInterval;

async function startServer() {
    try {
        await getDatabase();
        logger.info('Database connected successfully');

        server = app.listen(PORT, '0.0.0.0', () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV}`);
        });

        queueService.startProcessor();

        setTimeout(async () => {
            try {
                await queueService.processQueue();
            } catch (error) {
                console.error('First queue check failed:', error.message);
            }
        }, 3000);

        queueInterval = setInterval(async () => {
            try {
                const pending = await queueService.getPendingCount();
                if (pending > 0) await queueService.processQueue();
            } catch (error) {
                console.error('Queue interval error:', error.message);
            }
        }, 10000);

        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

async function gracefulShutdown() {
    if (queueInterval) clearInterval(queueInterval);
    if (server) {
        server.close(async () => {
            queueService.stopProcessor();
            await closeDatabase();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10000);
    }
}

startServer();

export default app;