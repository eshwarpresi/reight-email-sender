import rateLimit from 'express-rate-limit';

// General API rate limiter
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Email sending rate limiter
export const emailLimiter = rateLimit({
    windowMs: 60000, // 1 minute
    max: 50,
    message: {
        success: false,
        message: 'Email rate limit exceeded. Please wait before sending more emails.'
    },
    keyGenerator: (req) => {
        return req.user?.id?.toString() || req.ip;
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Login rate limiter
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: {
        success: false,
        message: 'Too many login attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

// Contact upload rate limiter
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: {
        success: false,
        message: 'Upload limit exceeded. Please try again later.'
    },
    keyGenerator: (req) => req.user?.id?.toString() || req.ip,
    standardHeaders: true,
    legacyHeaders: false,
});