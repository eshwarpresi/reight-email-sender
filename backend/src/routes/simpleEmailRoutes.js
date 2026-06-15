import express from 'express';
import multer from 'multer';
import { 
    sendSingleEmail, 
    sendBatchEmails, 
    getQueueStatus, 
    retryFailedEmails 
} from '../controllers/simpleEmailController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/send-single-email', upload.single('attachment'), sendSingleEmail);
router.post('/send-batch-emails', sendBatchEmails);
router.get('/queue-status', getQueueStatus);
router.post('/retry-failed', retryFailedEmails);

export default router;