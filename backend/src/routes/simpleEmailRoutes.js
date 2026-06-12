import express from 'express';
import multer from 'multer';
import { sendSingleEmail } from '../controllers/simpleEmailController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/send-single-email', upload.single('attachment'), sendSingleEmail);

export default router;