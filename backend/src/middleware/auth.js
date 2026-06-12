import jwt from 'jsonwebtoken';
import { queryOne } from '../database/connection.js';
import logger from '../utils/logger.js';

export async function authenticate(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication token required'
            });
        }

        // Verify JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if session exists and is valid
        const session = await queryOne(
            'SELECT * FROM user_sessions WHERE user_id = ? AND token = ? AND expires_at > datetime("now")',
            [decoded.userId, token]
        );
        
        if (!session) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }
        
        // Get user details
        const user = await queryOne(
            'SELECT id, email, full_name, role, is_active FROM users WHERE id = ?',
            [decoded.userId]
        );
        
        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'User not found or inactive'
            });
        }
        
        // Attach user to request
        req.user = user;
        req.token = token;
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        logger.error('Authentication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
}

export function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }
        
        if (roles.length && !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }
        
        next();
    };
}