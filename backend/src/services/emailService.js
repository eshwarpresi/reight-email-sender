import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import { run, queryOne } from '../database/connection.js';
import fs from 'fs/promises';
import path from 'path';

class EmailService {
    constructor() {
        this.transporter = null;
        this.initTransporter();
    }

    initTransporter() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT),
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
            tls: {
                rejectUnauthorized: false // Only for development
            },
            pool: true, // Use pooled connections
            maxConnections: 5,
            rateDelta: 1000, // 1 second between messages
            rateLimit: true
        });

        // Verify connection
        this.transporter.verify((error, success) => {
            if (error) {
                logger.error('SMTP connection error:', error);
            } else {
                logger.info('SMTP server is ready to send emails');
            }
        });
    }

    async sendEmail(emailData, queueId, campaignId) {
        const startTime = Date.now();
        
        try {
            // Prepare email options
            const mailOptions = {
                from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
                to: emailData.recipient_email,
                subject: emailData.subject,
                html: emailData.content_html || emailData.content,
                text: emailData.content.replace(/<[^>]*>/g, ''), // Strip HTML for text version
                headers: {
                    'X-Campaign-ID': campaignId,
                    'X-Queue-ID': queueId,
                    'X-Priority': '1'
                }
            };

            // Add attachments if any
            if (emailData.attachments && emailData.attachments.length > 0) {
                mailOptions.attachments = [];
                for (const attachment of emailData.attachments) {
                    try {
                        const filePath = path.resolve(attachment.file_path);
                        await fs.access(filePath);
                        mailOptions.attachments.push({
                            filename: attachment.original_name,
                            path: filePath,
                            contentType: attachment.mime_type
                        });
                    } catch (error) {
                        logger.error(`Attachment not found: ${attachment.file_path}`, error);
                    }
                }
            }

            // Send email
            const info = await this.transporter.sendMail(mailOptions);
            
            const duration = Date.now() - startTime;
            logger.info(`Email sent successfully to ${emailData.recipient_email}`, {
                messageId: info.messageId,
                queueId,
                campaignId,
                duration
            });

            // Update queue status
            await run(
                `UPDATE email_queue 
                 SET status = 'sent', 
                     sent_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ?`,
                [queueId]
            );

            // Log email
            await run(
                `INSERT INTO email_logs (email_queue_id, message_id, status, sent_at)
                 VALUES (?, ?, 'sent', datetime('now'))`,
                [queueId, info.messageId]
            );

            // Update campaign counts
            await run(
                `UPDATE campaigns 
                 SET sent_count = sent_count + 1,
                     updated_at = datetime('now')
                 WHERE id = ?`,
                [campaignId]
            );

            return {
                success: true,
                messageId: info.messageId,
                queueId
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`Failed to send email to ${emailData.recipient_email}`, {
                error: error.message,
                queueId,
                campaignId,
                duration
            });

            // Update queue status with error
            await run(
                `UPDATE email_queue 
                 SET status = 'failed',
                     error_message = ?,
                     retry_count = retry_count + 1,
                     updated_at = datetime('now')
                 WHERE id = ?`,
                [error.message, queueId]
            );

            // Log error
            await run(
                `INSERT INTO email_logs (email_queue_id, status, error, sent_at)
                 VALUES (?, 'failed', ?, datetime('now'))`,
                [queueId, error.message]
            );

            // Update campaign failed count
            await run(
                `UPDATE campaigns 
                 SET failed_count = failed_count + 1,
                     updated_at = datetime('now')
                 WHERE id = ?`,
                [campaignId]
            );

            return {
                success: false,
                error: error.message,
                queueId
            };
        }
    }

    async sendBulkEmails(campaignId, emails, onProgress) {
        const results = {
            sent: 0,
            failed: 0,
            total: emails.length,
            details: []
        };

        // Process emails with concurrency control
        const concurrency = parseInt(process.env.MAX_CONCURRENT_EMAILS) || 5;
        const chunks = this.chunkArray(emails, concurrency);
        
        let processed = 0;
        
        for (const chunk of chunks) {
            const promises = chunk.map(email => this.sendEmail(
                email,
                email.queueId,
                campaignId
            ));
            
            const chunkResults = await Promise.all(promises);
            
            for (const result of chunkResults) {
                if (result.success) {
                    results.sent++;
                } else {
                    results.failed++;
                }
                results.details.push(result);
                processed++;
                
                if (onProgress) {
                    onProgress({
                        processed,
                        total: results.total,
                        sent: results.sent,
                        failed: results.failed,
                        percentage: (processed / results.total) * 100
                    });
                }
            }
            
            // Small delay between chunks
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await this.delay(1000);
            }
        }

        // Update campaign as completed
        await run(
            `UPDATE campaigns 
             SET status = 'completed',
                 completed_at = datetime('now'),
                 updated_at = datetime('now')
             WHERE id = ?`,
            [campaignId]
        );

        return results;
    }

    async retryFailedEmails(emailIds) {
        const results = [];
        
        for (const emailId of emailIds) {
            // Get failed email details
            const email = await queryOne(
                `SELECT eq.*, c.subject, c.content, c.content_html 
                 FROM email_queue eq
                 JOIN campaigns c ON eq.campaign_id = c.id
                 WHERE eq.id = ? AND eq.status = 'failed' AND eq.retry_count < ?`,
                [emailId, parseInt(process.env.RETRY_ATTEMPTS) || 3]
            );
            
            if (email) {
                const result = await this.sendEmail(
                    {
                        recipient_email: email.recipient_email,
                        recipient_name: email.recipient_name,
                        subject: email.subject,
                        content: email.content,
                        content_html: email.content_html,
                        attachments: email.attachments ? JSON.parse(email.attachments) : []
                    },
                    email.id,
                    email.campaign_id
                );
                results.push(result);
            }
        }
        
        return results;
    }

    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async testConnection() {
        try {
            await this.transporter.verify();
            return { success: true, message: 'SMTP connection successful' };
        } catch (error) {
            logger.error('SMTP connection test failed:', error);
            return { success: false, message: error.message };
        }
    }
}

export default new EmailService();