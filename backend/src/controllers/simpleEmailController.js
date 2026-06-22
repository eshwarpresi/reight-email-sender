import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import queueService from '../services/queueService.js';

// DEFAULT COMPANY EMAIL - ALL EMAILS WILL BE SENT FROM THIS
const DEFAULT_EMAIL = process.env.SMTP_FROM_EMAIL || 'rates@pasfreight.com';

// Helper function to validate email format
const isValidEmail = (email) => {
    const cleanEmail = email.replace(/[<>]/g, '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(cleanEmail);
};

// Helper function to clean email
const cleanEmail = (email) => {
    let cleaned = email
        .replace(/[<>]/g, '')
        .replace(/^[\s]+|[\s]+$/g, '')
        .replace(/\s/g, '');
    
    const emailMatch = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
        cleaned = emailMatch[0];
    }
    return cleaned;
};

// Helper function to clean multiple emails (for CC/BCC)
const cleanMultipleEmails = (emailsString) => {
    if (!emailsString) return [];
    const emails = emailsString.split(/[;,]/);
    const cleanedEmails = [];
    for (const email of emails) {
        const cleaned = cleanEmail(email.trim());
        if (cleaned && isValidEmail(cleaned)) {
            cleanedEmails.push(cleaned);
        }
    }
    return cleanedEmails;
};

// Create transporter from environment variables
const createTransporter = () => {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    // Log configuration (without sensitive data)
    logger.info('Creating transporter with config:', {
        host: host || 'MISSING',
        port: port,
        user: user || 'MISSING',
        pass: pass ? 'PRESENT' : 'MISSING'
    });

    if (!host || !user || !pass) {
        const missing = [];
        if (!host) missing.push('SMTP_HOST');
        if (!user) missing.push('SMTP_USER');
        if (!pass) missing.push('SMTP_PASSWORD');
        throw new Error(`❌ Missing SMTP environment variables: ${missing.join(', ')}`);
    }

    return nodemailer.createTransport({
        host: host,
        port: port,
        secure: port === 465,
        auth: {
            user: user,
            pass: pass,
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2'
        },
    });
};

// Send single email using queue system
export const sendSingleEmail = async (req, res) => {
    try {
        let { to_email, cc_emails, bcc_emails, subject, content } = req.body;
        const attachment = req.file;

        const cleanedEmail = cleanEmail(to_email);
        
        if (!isValidEmail(cleanedEmail)) {
            return res.status(400).json({
                success: false,
                message: `Invalid email format: ${to_email}`
            });
        }

        // Use queue service - it will use environment variables for SMTP
        const queueItem = await queueService.addDirectToQueue(
            [cleanedEmail],
            process.env.SMTP_USER,
            process.env.SMTP_PASSWORD,
            subject,
            content,
            cc_emails,
            bcc_emails
        );

        res.json({
            success: true,
            message: `Email queued for sending to ${cleanedEmail}`,
            queueId: queueItem[0]?.id,
            queued: true,
            from: DEFAULT_EMAIL
        });

    } catch (error) {
        logger.error('Queue email error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// DIRECT SEND - Bypasses queue
export const sendSingleEmailDirect = async (req, res) => {
    try {
        let { to_email, cc_emails, bcc_emails, subject, content } = req.body;
        const attachment = req.file;

        const cleanedEmail = cleanEmail(to_email);
        
        if (!isValidEmail(cleanedEmail)) {
            return res.status(400).json({
                success: false,
                message: `Invalid email format: ${to_email}`
            });
        }

        // Clean CC and BCC emails
        const ccList = cleanMultipleEmails(cc_emails);
        const bccList = cleanMultipleEmails(bcc_emails);

        // Create transporter from environment variables
        const transporter = createTransporter();

        // Verify connection before sending
        logger.info('Verifying SMTP connection...');
        await transporter.verify();
        logger.info('SMTP connection verified successfully');

        const mailOptions = {
            from: DEFAULT_EMAIL,
            to: cleanedEmail,
            subject: subject || 'Freight Rates Request',
            html: content ? content.replace(/\n/g, '<br>') : '',
            text: content ? content.replace(/<[^>]*>/g, '') : '',
            replyTo: DEFAULT_EMAIL,
            headers: {
                'X-Priority': '1',
                'X-MSMail-Priority': 'High',
                'Importance': 'High',
                'X-Mailer': 'Freight Email Sender v2.0'
            }
        };

        if (ccList.length > 0) mailOptions.cc = ccList.join(', ');
        if (bccList.length > 0) mailOptions.bcc = bccList.join(', ');

        if (attachment) {
            mailOptions.attachments = [{
                filename: attachment.originalname,
                content: attachment.buffer,
            }];
        }

        await transporter.sendMail(mailOptions);
        transporter.close();

        logger.info(`✅ Email sent directly to ${cleanedEmail} from ${DEFAULT_EMAIL}`);
        
        res.json({
            success: true,
            message: `Email sent to ${cleanedEmail}`,
            from: DEFAULT_EMAIL
        });

    } catch (error) {
        logger.error('Direct send error:', error);
        
        let errorMessage = error.message;
        if (errorMessage.includes('Invalid login') || errorMessage.includes('535')) {
            errorMessage = '❌ Invalid SMTP credentials! Check SMTP_USER and SMTP_PASSWORD in environment variables.';
        } else if (errorMessage.includes('ECONNREFUSED')) {
            errorMessage = `❌ SMTP connection refused to ${process.env.SMTP_HOST}. Check if host is correct.`;
        } else if (errorMessage.includes('timeout')) {
            errorMessage = `❌ Connection timeout to ${process.env.SMTP_HOST}. Check network/firewall.`;
        } else if (errorMessage.includes('Missing SMTP')) {
            errorMessage = '❌ SMTP configuration missing. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in environment variables.';
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage
        });
    }
};

// Batch send - USING QUEUE SYSTEM
export const sendBatchEmails = async (req, res) => {
    try {
        const { recipients, cc_emails, bcc_emails, subject, content } = req.body;
        
        const ccList = cleanMultipleEmails(cc_emails);
        const bccList = cleanMultipleEmails(bcc_emails);
        
        const validRecipients = [];
        const invalidRecipients = [];
        
        for (const recipient of recipients) {
            const cleanedEmail = cleanEmail(recipient.email);
            if (isValidEmail(cleanedEmail)) {
                validRecipients.push({ ...recipient, email: cleanedEmail });
            } else {
                invalidRecipients.push(recipient.email);
            }
        }
        
        if (validRecipients.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid recipients found'
            });
        }

        const queueItems = [];
        for (const recipient of validRecipients) {
            const personalizedContent = content ? content.replace(/{NAME}/g, recipient.name || 'Valued Customer') : '';
            
            const result = await queueService.addDirectToQueue(
                [recipient.email],
                process.env.SMTP_USER,
                process.env.SMTP_PASSWORD,
                subject,
                personalizedContent,
                ccList.join(', '),
                bccList.join(', ')
            );
            queueItems.push(...result);
        }
        
        res.json({
            success: true,
            message: `${queueItems.length} emails queued for sending from ${DEFAULT_EMAIL}`,
            data: {
                queued: queueItems.length,
                invalid: invalidRecipients.length,
                invalidEmails: invalidRecipients,
                from: DEFAULT_EMAIL
            }
        });
        
    } catch (error) {
        logger.error('Batch send error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get queue status endpoint
export const getQueueStatus = async (req, res) => {
    try {
        const pendingCount = await queueService.getPendingCount();
        res.json({
            success: true,
            data: {
                pending: pendingCount,
                processing: queueService.isProcessing
            }
        });
    } catch (error) {
        logger.error('Get queue status error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Retry failed emails
export const retryFailedEmails = async (req, res) => {
    try {
        const { emailIds } = req.body;
        const retried = await queueService.retryFailed(0, emailIds);
        res.json({
            success: true,
            message: `Retrying ${retried} failed emails`,
            data: { retried }
        });
    } catch (error) {
        logger.error('Retry failed emails error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};