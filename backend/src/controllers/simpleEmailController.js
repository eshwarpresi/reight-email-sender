import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import queueService from '../services/queueService.js';

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

// Auto-detect email provider and create transporter
const createTransporter = (from_email, from_password) => {
    const domain = from_email.split('@')[1]?.toLowerCase() || '';
    
    // Default: Gmail
    let config = {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: from_email,
            pass: from_password,
        },
        connectionTimeout: 90000,
        greetingTimeout: 90000,
        socketTimeout: 90000,
        tls: {
            rejectUnauthorized: false,
        },
    };

    // Outlook/Hotmail/Live
    if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) {
        config = {
            host: 'smtp-mail.outlook.com',
            port: 587,
            secure: false,
            auth: {
                user: from_email,
                pass: from_password,
            },
            connectionTimeout: 90000,
            greetingTimeout: 90000,
            socketTimeout: 90000,
            tls: {
                rejectUnauthorized: false,
            },
        };
    }
    
    // Brevo (Sendinblue)
    if (domain.includes('brevo') || domain.includes('sendinblue')) {
        config = {
            host: 'smtp-relay.brevo.com',
            port: 587,
            secure: false,
            auth: {
                user: from_email,
                pass: from_password,
            },
            connectionTimeout: 90000,
            greetingTimeout: 90000,
            socketTimeout: 90000,
            tls: {
                rejectUnauthorized: false,
            },
        };
    }

    // Yahoo
    if (domain.includes('yahoo')) {
        config = {
            host: 'smtp.mail.yahoo.com',
            port: 465,
            secure: true,
            auth: {
                user: from_email,
                pass: from_password,
            },
            connectionTimeout: 90000,
            greetingTimeout: 90000,
            socketTimeout: 90000,
            tls: {
                rejectUnauthorized: false,
            },
        };
    }

    return nodemailer.createTransport(config);
};

// Send single email using queue system
export const sendSingleEmail = async (req, res) => {
    try {
        let { from_email, from_password, to_email, cc_emails, bcc_emails, subject, content } = req.body;
        const attachment = req.file;

        const cleanedEmail = cleanEmail(to_email);
        
        if (!isValidEmail(cleanedEmail)) {
            return res.status(400).json({
                success: false,
                message: `Invalid email format: ${to_email}`
            });
        }

        // Add to queue system
        const queueItem = await queueService.addDirectToQueue(
            [cleanedEmail],
            from_email,
            from_password,
            subject,
            content,
            cc_emails,
            bcc_emails
        );

        res.json({
            success: true,
            message: `Email queued for sending to ${cleanedEmail}`,
            queueId: queueItem[0]?.id,
            queued: true
        });

    } catch (error) {
        logger.error('Queue email error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// DIRECT SEND - Bypasses queue (like Personalized Email)
export const sendSingleEmailDirect = async (req, res) => {
    try {
        let { from_email, from_password, to_email, cc_emails, bcc_emails, subject, content } = req.body;
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

        // Create transporter based on email provider
        const transporter = createTransporter(from_email, from_password);

        // Verify connection before sending
        await transporter.verify();

        const mailOptions = {
            from: from_email,
            to: cleanedEmail,
            subject: subject,
            html: content.replace(/\n/g, '<br>'),
            text: content.replace(/<[^>]*>/g, ''),
            replyTo: from_email,
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

        logger.info(`✅ Email sent directly to ${cleanedEmail} from ${from_email}`);
        
        res.json({
            success: true,
            message: `Email sent to ${cleanedEmail}`
        });

    } catch (error) {
        logger.error('Direct send error:', error);
        
        let errorMessage = error.message;
        if (errorMessage.includes('Invalid login') || errorMessage.includes('535')) {
            errorMessage = '❌ Invalid email credentials! Please check your email and password/App Password in Settings.';
        } else if (errorMessage.includes('ECONNREFUSED')) {
            errorMessage = '❌ SMTP connection refused. Please check your network or try a different email provider.';
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
        const { from_email, from_password, recipients, cc_emails, bcc_emails, subject, content } = req.body;
        
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
            const personalizedContent = content.replace(/{NAME}/g, recipient.name || 'Valued Customer');
            
            const result = await queueService.addDirectToQueue(
                [recipient.email],
                from_email,
                from_password,
                subject,
                personalizedContent,
                ccList.join(', '),
                bccList.join(', ')
            );
            queueItems.push(...result);
        }
        
        res.json({
            success: true,
            message: `${queueItems.length} emails queued for sending`,
            data: {
                queued: queueItems.length,
                invalid: invalidRecipients.length,
                invalidEmails: invalidRecipients
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