import express from 'express';
import authController from '../controllers/authController.js';
import { validateLogin, validateRegister } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes
router.post('/register', validateRegister, authController.register);
router.post('/login', loginLimiter, validateLogin, authController.login);

// Protected routes
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.put('/change-password', authenticate, authController.changePassword);

// SMTP Settings routes
router.post('/smtp-settings', authenticate, authController.saveSmtpSettings);
router.get('/smtp-settings', authenticate, authController.getSmtpSettings);

export default router;