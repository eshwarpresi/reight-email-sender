import express from 'express';
import multer from 'multer';
import { sendSingleEmail, sendBatchEmails } from '../controllers/simpleEmailController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Single email endpoint (with attachment support)
router.post('/send-single-email', upload.single('attachment'), sendSingleEmail);

// Batch email endpoint (for sending multiple emails with rate limiting)
router.post('/send-batch-emails', sendBatchEmails);

export default router;