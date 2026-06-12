import express from 'express';
import contactController from '../controllers/contactController.js';
import { authenticate } from '../middleware/auth.js';
import { validateContact, validateIdParam } from '../middleware/validation.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, process.env.UPLOAD_PATH || './uploads');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['text/csv', 'application/json', 'application/vnd.ms-excel'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only CSV, JSON, and Excel files are allowed.'));
        }
    }
});

// All routes require authentication
router.use(authenticate);

// Group routes (must come before /:id route)
router.post('/groups', contactController.createGroup);
router.get('/groups', contactController.getGroups);

// Contact routes
router.post('/', validateContact, contactController.addContact);
router.get('/', contactController.getContacts);
router.delete('/:id', validateIdParam, contactController.deleteContact);
router.post('/import', uploadLimiter, upload.single('file'), contactController.importContacts);

export default router;