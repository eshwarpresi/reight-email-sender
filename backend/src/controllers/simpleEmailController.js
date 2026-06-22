import logger from '../utils/logger.js';
import queueService from '../services/queueService.js';

const DEFAULT_EMAIL = process.env.SMTP_FROM_EMAIL || 'rates@pasfreight.com';
const DEFAULT_NAME = process.env.SMTP_FROM_NAME || 'Freight Operations';
const BREVO_API_KEY = process.env.BREVO_API_KEY;

const isValidEmail = (email) => {
    const clean = email.replace(/[<>]/g, '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
};

const cleanEmail = (email) => {
    let cleaned = email.replace(/[<>]/g, '').replace(/^[\s]+|[\s]+$/g, '').replace(/\s/g, '');
    const match = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0] : cleaned;
};

const cleanMultipleEmails = (emailsString) => {
    if (!emailsString) return [];
    return emailsString.split(/[;,]/)
        .map(e => cleanEmail(e.trim()))
        .filter(e => e && isValidEmail(e));
};

// Send via Brevo REST API (HTTPS port 443 - works on Render free tier)
const sendViaBrevoApi = async ({ to, subject, html, text, cc, bcc, attachments }) => {
    if (!BREVO_API_KEY) {
        throw new Error('❌ BREVO_API_KEY not set in environment variables');
    }

    const payload = {
        sender: { email: DEFAULT_EMAIL, name: DEFAULT_NAME },
        to: [{ email: to }],
        subject: subject || 'Freight Rates Request',
        htmlContent: html || '',
        textContent: text || '',
        replyTo: { email: DEFAULT_EMAIL, name: DEFAULT_NAME }
    };

    if (cc?.length) payload.cc = cc.map(e => ({ email: e }));
    if (bcc?.length) payload.bcc = bcc.map(e => ({ email: e }));
    if (attachments?.length) payload.attachment = attachments;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': BREVO_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Brevo API error: ${response.status}`);
    }

    return response.json();
};

// DIRECT SEND - Uses Brevo API
export const sendSingleEmailDirect = async (req, res) => {
    try {
        const { to_email, cc_emails, bcc_emails, subject, content } = req.body;
        const attachment = req.file;

        const cleanedEmail = cleanEmail(to_email);
        if (!isValidEmail(cleanedEmail)) {
            return res.status(400).json({ success: false, message: `Invalid email: ${to_email}` });
        }

        const ccList = cleanMultipleEmails(cc_emails);
        const bccList = cleanMultipleEmails(bcc_emails);

        const attachments = [];
        if (attachment) {
            attachments.push({
                name: attachment.originalname,
                content: attachment.buffer.toString('base64')
            });
        }

        logger.info(`Sending via Brevo API to ${cleanedEmail} from ${DEFAULT_EMAIL}`);

        await sendViaBrevoApi({
            to: cleanedEmail,
            subject,
            html: content?.replace(/\n/g, '<br>') || '',
            text: content?.replace(/<[^>]*>/g, '') || '',
            cc: ccList,
            bcc: bccList,
            attachments
        });

        logger.info(`✅ Email sent to ${cleanedEmail}`);

        res.json({
            success: true,
            message: `Email sent to ${cleanedEmail}`,
            from: DEFAULT_EMAIL
        });

    } catch (error) {
        logger.error('Direct send error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to send email'
        });
    }
};

// Queue-based send
export const sendSingleEmail = async (req, res) => {
    try {
        const { to_email, cc_emails, bcc_emails, subject, content } = req.body;
        const cleanedEmail = cleanEmail(to_email);

        if (!isValidEmail(cleanedEmail)) {
            return res.status(400).json({ success: false, message: `Invalid email: ${to_email}` });
        }

        const queueItem = await queueService.addDirectToQueue(
            [cleanedEmail],
            DEFAULT_EMAIL,
            BREVO_API_KEY,
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
        res.status(500).json({ success: false, message: error.message });
    }
};

// Batch send
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
            return res.status(400).json({ success: false, message: 'No valid recipients' });
        }

        const queueItems = [];
        for (const recipient of validRecipients) {
            const personalizedContent = content?.replace(/{NAME}/g, recipient.name || 'Valued Customer') || '';
            const result = await queueService.addDirectToQueue(
                [recipient.email],
                DEFAULT_EMAIL,
                BREVO_API_KEY,
                subject,
                personalizedContent,
                ccList.join(', '),
                bccList.join(', ')
            );
            queueItems.push(...result);
        }

        res.json({
            success: true,
            message: `${queueItems.length} emails queued from ${DEFAULT_EMAIL}`,
            data: {
                queued: queueItems.length,
                invalid: invalidRecipients.length,
                invalidEmails: invalidRecipients,
                from: DEFAULT_EMAIL
            }
        });

    } catch (error) {
        logger.error('Batch send error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getQueueStatus = async (req, res) => {
    try {
        const pendingCount = await queueService.getPendingCount();
        res.json({ success: true, data: { pending: pendingCount, processing: queueService.isProcessing } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const retryFailedEmails = async (req, res) => {
    try {
        const { emailIds } = req.body;
        const retried = await queueService.retryFailed(0, emailIds);
        res.json({ success: true, message: `Retrying ${retried} failed emails`, data: { retried } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};