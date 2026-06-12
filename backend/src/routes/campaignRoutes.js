import express from 'express';
import campaignController from '../controllers/campaignController.js';
import { authenticate } from '../middleware/auth.js';
import { validateCampaign, validateIdParam, validatePagination, validateResend } from '../middleware/validation.js';
import { emailLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Campaign routes
router.post('/', emailLimiter, validateCampaign, campaignController.createCampaign);
router.get('/', validatePagination, campaignController.getCampaigns);
router.get('/dashboard/stats', campaignController.getDashboardStats);
router.get('/:id', validateIdParam, campaignController.getCampaignDetails);
router.post('/:id/cancel', validateIdParam, campaignController.cancelCampaign);
router.post('/:id/retry', validateIdParam, validateResend, campaignController.retryFailed);
router.get('/:id/export', validateIdParam, campaignController.exportCampaignReport);

export default router;