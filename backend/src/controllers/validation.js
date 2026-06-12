import { body, param, query, validationResult } from 'express-validator';

export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

export const validateLogin = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email address is required'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),
    handleValidationErrors
];

export const validateRegister = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email address is required'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('full_name')
        .notEmpty()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters'),
    body('confirm_password')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match'),
    handleValidationErrors
];

export const validateCampaign = [
    body('name')
        .notEmpty()
        .trim()
        .isLength({ min: 3, max: 255 })
        .withMessage('Campaign name must be between 3 and 255 characters'),
    body('subject')
        .notEmpty()
        .trim()
        .isLength({ min: 1, max: 500 })
        .withMessage('Subject must be between 1 and 500 characters'),
    body('content')
        .notEmpty()
        .withMessage('Email content is required'),
    body('recipients')
        .isArray()
        .withMessage('Recipients must be an array')
        .custom((value) => value.length > 0)
        .withMessage('At least one recipient is required')
        .custom((value) => value.length <= 1000)
        .withMessage('Maximum 1000 recipients per campaign'),
    body('recipients.*.email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email address required for all recipients'),
    handleValidationErrors
];

export const validateContact = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email address is required'),
    body('full_name')
        .optional()
        .trim()
        .isLength({ max: 255 }),
    body('company_name')
        .optional()
        .trim()
        .isLength({ max: 255 }),
    handleValidationErrors
];

export const validateBulkContacts = [
    body('contacts')
        .isArray()
        .withMessage('Contacts must be an array')
        .custom((value) => value.length > 0 && value.length <= 1000)
        .withMessage('Must have between 1 and 1000 contacts'),
    body('contacts.*.email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email required for all contacts'),
    handleValidationErrors
];

export const validateIdParam = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Valid ID parameter is required'),
    handleValidationErrors
];

export const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .toInt()
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .toInt()
        .withMessage('Limit must be between 1 and 100'),
    handleValidationErrors
];

export const validateResend = [
    body('email_ids')
        .isArray()
        .withMessage('Email IDs must be an array')
        .custom((value) => value.length > 0)
        .withMessage('At least one email ID is required'),
    body('email_ids.*')
        .isInt({ min: 1 })
        .withMessage('Invalid email ID'),
    handleValidationErrors
];