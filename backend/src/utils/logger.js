import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Detect if running on Vercel serverless environment
const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Use /tmp for Vercel (writable), otherwise use ./logs
let logDir = process.env.LOG_PATH || './logs';

if (isVercel) {
    logDir = '/tmp/logs';
}

// Try to create log directory, but don't fail if it doesn't work
let logDirExists = false;
try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    logDirExists = true;
    console.log(`📁 Log directory: ${logDir}`);
} catch (error) {
    console.log('⚠️ Could not create logs directory, using console only');
    logDirExists = false;
}

const logLevel = process.env.LOG_LEVEL || 'info';

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
);

// Create transports array
const transports = [];

// Always add console transport
transports.push(
    new winston.transports.Console({
        format: consoleFormat
    })
);

// Add file transports only if directory exists
if (logDirExists) {
    try {
        transports.push(
            new winston.transports.File({
                filename: path.join(logDir, 'combined.log'),
                maxsize: 5242880, // 5MB
                maxFiles: 3,
            }),
            new winston.transports.File({
                filename: path.join(logDir, 'error.log'),
                level: 'error',
                maxsize: 5242880,
                maxFiles: 3,
            })
        );
        // Only add emails.log if not in Vercel (to reduce writes)
        if (!isVercel) {
            transports.push(
                new winston.transports.File({
                    filename: path.join(logDir, 'emails.log'),
                    level: 'info',
                    maxsize: 5242880,
                    maxFiles: 3,
                })
            );
        }
    } catch (error) {
        console.log('⚠️ Could not create file transports, using console only');
    }
}

// Create logger instance
const logger = winston.createLogger({
    level: logLevel,
    format: logFormat,
    transports: transports,
});

// Create stream for Morgan integration (only if logDir exists)
export const stream = {
    write: (message) => {
        if (logDirExists) {
            logger.info(message.trim());
        } else {
            console.log(message.trim());
        }
    }
};

export default logger;