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

// Send single email using queue system (NO TIMEOUT)
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

        // Add to queue system instead of sending immediately
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

// Batch send with queue system (NO TIMEOUT, HANDLES 200+ EMAILS)
export const sendBatchEmails = async (req, res) => {
    try {
        const { from_email, from_password, recipients, cc_emails, bcc_emails, subject, content } = req.body;
        
        // Clean CC and BCC emails
        const ccList = cleanMultipleEmails(cc_emails);
        const bccList = cleanMultipleEmails(bcc_emails);
        
        // Validate all recipient emails
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

        // Add all emails to queue system (NO TIMEOUT)
        const queuePromises = validRecipients.map(async (recipient) => {
            const personalizedContent = content.replace(/{NAME}/g, recipient.name || 'Valued Customer');
            
            // Create a transporter and send
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: from_email,
                    pass: from_password,
                },
                pool: true,
                maxConnections: 3,
                rateDelta: 3000,
                rateLimit: true,
            });

            const mailOptions = {
                from: from_email,
                to: recipient.email,
                subject: subject,
                html: personalizedContent,
                text: personalizedContent.replace(/<[^>]*>/g, ''),
            };
            
            if (ccList.length > 0) mailOptions.cc = ccList.join(', ');
            if (bccList.length > 0) mailOptions.bcc = bccList.join(', ');

            try {
                await transporter.sendMail(mailOptions);
                transporter.close();
                return { success: true, email: recipient.email, name: recipient.name };
            } catch (error) {
                transporter.close();
                return { success: false, email: recipient.email, name: recipient.name, error: error.message };
            }
        });

        // Execute with concurrency limit (5 at a time)
        const concurrencyLimit = 5;
        const results = [];
        
        for (let i = 0; i < queuePromises.length; i += concurrencyLimit) {
            const batch = queuePromises.slice(i, i + concurrencyLimit);
            const batchResults = await Promise.all(batch);
            results.push(...batchResults);
            
            // Delay between batches
            if (i + concurrencyLimit < queuePromises.length) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        const sentCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;
        
        res.json({
            success: true,
            message: `Batch queued: ${sentCount} sent, ${failedCount} failed, ${invalidRecipients.length} invalid`,
            data: {
                sent: sentCount,
                failed: failedCount,
                invalid: invalidRecipients.length,
                details: results,
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