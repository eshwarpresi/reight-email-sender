import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

// Helper function to validate email format
const isValidEmail = (email) => {
    // Remove any HTML tags or extra characters
    const cleanEmail = email.replace(/[<>]/g, '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(cleanEmail);
};

// Helper function to clean email (remove HTML tags, spaces, etc.)
const cleanEmail = (email) => {
    // Remove HTML tags, brackets, extra spaces
    let cleaned = email
        .replace(/[<>]/g, '')
        .replace(/^[\s]+|[\s]+$/g, '')
        .replace(/\s/g, '');
    
    // Extract email if there's a pattern like "Name <email@domain.com>"
    const emailMatch = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
        cleaned = emailMatch[0];
    }
    
    return cleaned;
};

// Helper function to clean multiple emails (for CC/BCC)
const cleanMultipleEmails = (emailsString) => {
    if (!emailsString) return [];
    
    // Split by comma or semicolon
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

// Helper function to delay between sends
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Send email with retry logic
const sendEmailWithRetry = async (transporter, mailOptions, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
        try {
            await transporter.sendMail(mailOptions);
            return { success: true, error: null };
        } catch (error) {
            if (i === retries) {
                return { success: false, error: error.message };
            }
            // Wait before retry (increases each time)
            await delay(2000 * (i + 1));
        }
    }
    return { success: false, error: 'Max retries exceeded' };
};

export const sendSingleEmail = async (req, res) => {
    try {
        let { from_email, from_password, to_email, cc_emails, bcc_emails, subject, content } = req.body;
        const attachment = req.file;

        // Clean and validate main recipient email
        const cleanedEmail = cleanEmail(to_email);
        
        if (!isValidEmail(cleanedEmail)) {
            logger.error(`Invalid email format: ${to_email}`);
            return res.status(400).json({
                success: false,
                message: `Invalid email format: ${to_email}`,
                invalidEmail: true
            });
        }

        // Clean CC and BCC emails
        const ccList = cleanMultipleEmails(cc_emails);
        const bccList = cleanMultipleEmails(bcc_emails);

        // Create transporter with connection pool for better performance
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
            rateDelta: 2000,
            rateLimit: true,
        });

        // Verify connection before sending
        await transporter.verify();

        const mailOptions = {
            from: from_email,
            to: cleanedEmail,
            subject: subject,
            html: content,
            text: content.replace(/<[^>]*>/g, ''),
        };

        // Add CC if provided
        if (ccList.length > 0) {
            mailOptions.cc = ccList.join(', ');
        }

        // Add BCC if provided
        if (bccList.length > 0) {
            mailOptions.bcc = bccList.join(', ');
        }

        if (attachment) {
            mailOptions.attachments = [{
                filename: attachment.originalname,
                content: attachment.buffer,
            }];
        }

        // Send with retry logic
        const result = await sendEmailWithRetry(transporter, mailOptions, 2);
        
        if (result.success) {
            logger.info(`Email sent successfully to ${cleanedEmail}${ccList.length > 0 ? `, CC: ${ccList.join(', ')}` : ''}`);
            res.json({
                success: true,
                message: `Email sent to ${cleanedEmail}`,
                cc: ccList,
                bcc: bccList
            });
        } else {
            logger.error(`Failed to send email to ${cleanedEmail}: ${result.error}`);
            res.status(500).json({
                success: false,
                message: result.error,
                email: cleanedEmail
            });
        }
        
        // Close transporter connection
        transporter.close();
        
    } catch (error) {
        logger.error('Send email error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Batch send with rate limiting and CC support
export const sendBatchEmails = async (req, res) => {
    try {
        const { from_email, from_password, recipients, cc_emails, bcc_emails, subject, content } = req.body;
        const results = [];
        
        // Clean CC and BCC emails (same for all recipients in batch)
        const ccList = cleanMultipleEmails(cc_emails);
        const bccList = cleanMultipleEmails(bcc_emails);
        
        // Validate all recipient emails first
        const validRecipients = [];
        const invalidRecipients = [];
        
        for (const recipient of recipients) {
            const cleanedEmail = cleanEmail(recipient.email);
            if (isValidEmail(cleanedEmail)) {
                validRecipients.push({ ...recipient, cleanedEmail });
            } else {
                invalidRecipients.push(recipient.email);
            }
        }
        
        // Create transporter
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
            rateDelta: 2000,
            rateLimit: true,
        });
        
        await transporter.verify();
        
        // Send emails with delay between each
        for (let i = 0; i < validRecipients.length; i++) {
            const recipient = validRecipients[i];
            const personalizedContent = content.replace(/{NAME}/g, recipient.name || 'Valued Customer');
            
            const mailOptions = {
                from: from_email,
                to: recipient.cleanedEmail,
                subject: subject,
                html: personalizedContent,
                text: personalizedContent.replace(/<[^>]*>/g, ''),
            };
            
            // Add CC if provided
            if (ccList.length > 0) {
                mailOptions.cc = ccList.join(', ');
            }
            
            // Add BCC if provided
            if (bccList.length > 0) {
                mailOptions.bcc = bccList.join(', ');
            }
            
            const result = await sendEmailWithRetry(transporter, mailOptions, 2);
            
            results.push({
                email: recipient.cleanedEmail,
                name: recipient.name,
                success: result.success,
                error: result.error
            });
            
            // Add delay between emails to avoid rate limiting
            if (i < validRecipients.length - 1) {
                await delay(2000);
            }
        }
        
        transporter.close();
        
        const sentCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;
        
        res.json({
            success: true,
            message: `Sent: ${sentCount}, Failed: ${failedCount}, Invalid: ${invalidRecipients.length}`,
            data: {
                sent: sentCount,
                failed: failedCount,
                invalid: invalidRecipients.length,
                cc: ccList,
                bcc: bccList,
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