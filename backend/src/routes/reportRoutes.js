import express from 'express';
import reportController from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';
import { validatePagination } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Report routes
router.get('/emails', validatePagination, reportController.getEmailReports);
router.get('/export', reportController.exportFullReport);
router.get('/analytics', reportController.getCampaignAnalytics);

export default router;