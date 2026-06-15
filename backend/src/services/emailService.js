import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import { run, queryOne } from '../database/connection.js';
import fs from 'fs/promises';
import path from 'path';

class EmailService {
    constructor() {
        this.transporter = null;
    }

    // Create transporter with user's credentials - OPTIMIZED FOR PRODUCTION
    createTransporter(from_email, from_password) {
        return nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465, // Use SSL instead of TLS (more reliable)
            secure: true, // SSL
            auth: {
                user: from_email,
                pass: from_password,
            },
            connectionTimeout: 90000, // 90 seconds connection timeout
            greetingTimeout: 90000,
            socketTimeout: 90000,
            tls: {
                rejectUnauthorized: false,
                ciphers: 'SSLv3'
            },
            pool: false, // Disable pool for better reliability
            maxConnections: 1,
            rateDelta: 3000, // 3 seconds between messages
        });
    }

    async sendEmail(emailData, queueId, campaignId, userEmail, userPassword) {
        const startTime = Date.now();
        let transporter = null;
        
        try {
            logger.info(`Starting to send email to ${emailData.recipient_email}`);
            
            // Create transporter with user's credentials
            transporter = this.createTransporter(userEmail, userPassword);
            
            // Prepare email options
            const mailOptions = {
                from: userEmail,
                to: emailData.recipient_email,
                subject: emailData.subject,
                html: emailData.content_html || emailData.content.replace(/\n/g, '<br>'),
                text: emailData.content.replace(/<[^>]*>/g, ''),
            };

            // Add CC if provided
            if (emailData.cc_emails && emailData.cc_emails.length > 0) {
                mailOptions.cc = emailData.cc_emails;
            }

            // Add BCC if provided
            if (emailData.bcc_emails && emailData.bcc_emails.length > 0) {
                mailOptions.bcc = emailData.bcc_emails;
            }

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

            // Send email with timeout
            const sendPromise = transporter.sendMail(mailOptions);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Send timeout after 90 seconds')), 90000);
            });
            
            const info = await Promise.race([sendPromise, timeoutPromise]);
            
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
            if (campaignId) {
                await run(
                    `UPDATE campaigns 
                     SET sent_count = sent_count + 1,
                         updated_at = datetime('now')
                     WHERE id = ?`,
                    [campaignId]
                );
            }

            if (transporter) {
                transporter.close();
            }

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
            if (campaignId) {
                await run(
                    `UPDATE campaigns 
                     SET failed_count = failed_count + 1,
                         updated_at = datetime('now')
                     WHERE id = ?`,
                    [campaignId]
                );
            }

            if (transporter) {
                transporter.close();
            }

            return {
                success: false,
                error: error.message,
                queueId
            };
        }
    }

    async sendBulkEmails(campaignId, emails, onProgress, userEmail, userPassword) {
        const results = {
            sent: 0,
            failed: 0,
            total: emails.length,
            details: []
        };

        // Process emails one by one for better reliability
        let processed = 0;
        
        for (const email of emails) {
            const result = await this.sendEmail(
                email,
                email.queueId,
                campaignId,
                userEmail,
                userPassword
            );
            
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
            
            // Delay between emails to avoid rate limiting
            if (processed < results.total) {
                await this.delay(3000);
            }
        }

        return results;
    }

    async retryFailedEmails(emailIds, userEmail, userPassword) {
        const results = [];
        
        for (const emailId of emailIds) {
            const email = await queryOne(
                `SELECT eq.*, c.subject, c.content, c.content_html 
                 FROM email_queue eq
                 LEFT JOIN campaigns c ON eq.campaign_id = c.id
                 WHERE eq.id = ? AND eq.status = 'failed'`,
                [emailId]
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
                    email.campaign_id,
                    userEmail,
                    userPassword
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

    async testConnection(from_email, from_password) {
        try {
            const transporter = this.createTransporter(from_email, from_password);
            await transporter.verify();
            transporter.close();
            return { success: true, message: 'SMTP connection successful' };
        } catch (error) {
            logger.error('SMTP connection test failed:', error);
            return { success: false, message: error.message };
        }
    }
}

export default new EmailService();