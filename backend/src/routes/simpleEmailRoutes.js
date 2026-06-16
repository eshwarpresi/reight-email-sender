import express from 'express';
import multer from 'multer';
import { 
    sendSingleEmail, 
    sendBatchEmails, 
    getQueueStatus, 
    retryFailedEmails 
} from '../controllers/simpleEmailController.js';
import queueService from '../services/queueService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Email sending endpoints
router.post('/send-single-email', upload.single('attachment'), sendSingleEmail);
router.post('/send-batch-emails', sendBatchEmails);

// Queue management endpoints
router.get('/queue-status', getQueueStatus);
router.post('/retry-failed', retryFailedEmails);

// Force process queue - MANUAL TRIGGER
router.get('/force-process-queue', async (req, res) => {
    try {
        console.log('🔄 Manual queue processing triggered...');
        await queueService.processQueue();
        res.json({ 
            success: true, 
            message: 'Queue processing triggered successfully. Check logs for details.' 
        });
    } catch (error) {
        console.error('❌ Force queue processing error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get pending count
router.get('/pending-count', async (req, res) => {
    try {
        const count = await queueService.getPendingCount();
        res.json({ 
            success: true, 
            pending: count 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

export default router;