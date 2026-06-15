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
        let { from_email, from_password, to_email, subject, content } = req.body;
        const attachment = req.file;

        // Clean and validate email
        const cleanedEmail = cleanEmail(to_email);
        
        if (!isValidEmail(cleanedEmail)) {
            logger.error(`Invalid email format: ${to_email}`);
            return res.status(400).json({
                success: false,
                message: `Invalid email format: ${to_email}`,
                invalidEmail: true
            });
        }

        // Create transporter with connection pool for better performance
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: from_email,
                pass: from_password,
            },
            pool: true, // Use connection pool
            maxConnections: 3, // Limit concurrent connections
            rateDelta: 2000, // 2 seconds between messages
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

        if (attachment) {
            mailOptions.attachments = [{
                filename: attachment.originalname,
                content: attachment.buffer,
            }];
        }

        // Send with retry logic
        const result = await sendEmailWithRetry(transporter, mailOptions, 2);
        
        if (result.success) {
            logger.info(`Email sent successfully to ${cleanedEmail}`);
            res.json({
                success: true,
                message: `Email sent to ${cleanedEmail}`
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

// Batch send with rate limiting
export const sendBatchEmails = async (req, res) => {
    try {
        const { from_email, from_password, recipients, subject, content } = req.body;
        const results = [];
        
        // Validate all emails first
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
            
            const result = await sendEmailWithRetry(transporter, mailOptions, 2);
            
            results.push({
                email: recipient.cleanedEmail,
                name: recipient.name,
                success: result.success,
                error: result.error
            });
            
            // Add delay between emails to avoid rate limiting
            if (i < validRecipients.length - 1) {
                await delay(2000); // 2 second delay
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