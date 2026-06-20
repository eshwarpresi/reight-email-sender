import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import { run, queryOne } from '../database/connection.js';
import fs from 'fs/promises';
import path from 'path';

class EmailService {
    constructor() {
        this.transporter = null;
    }

    // Create transporter with Brevo SMTP (works on Render!)
    createTransporter(from_email, from_password) {
        // Use Brevo SMTP - reliable on Render
        return nodemailer.createTransport({
            host: 'smtp-relay.brevo.com',
            port: 587,
            secure: false,
            auth: {
                user: from_email,  // Brevo SMTP Login (af64cb001@smtp-brevo.com)
                pass: from_password, // Brevo SMTP Key
            },
            connectionTimeout: 30000,
            greetingTimeout: 30000,
            socketTimeout: 30000,
            tls: {
                rejectUnauthorized: false,
                minVersion: 'TLSv1.2'
            },
        });
    }

    async sendEmail(emailData, queueId, campaignId, userEmail, userPassword) {
        const startTime = Date.now();
        let transporter = null;
        
        try {
            logger.info(`Starting to send email to ${emailData.recipient_email}`);
            
            if (!userEmail || !userPassword) {
                throw new Error('❌ No email credentials found!');
            }
            
            transporter = this.createTransporter(userEmail, userPassword);
            
            // Verify connection before sending
            await transporter.verify();
            
            const content = emailData.content || '';
            const contentHtml = emailData.content_html || content;
            
            const mailOptions = {
                from: 'rates@pasfreight.com', // Always use company email
                to: emailData.recipient_email,
                subject: emailData.subject || 'Freight Rates Request',
                html: contentHtml.replace(/\n/g, '<br>'),
                text: content.replace(/<[^>]*>/g, ''),
                replyTo: 'rates@pasfreight.com',
                headers: {
                    'X-Priority': '1',
                    'X-MSMail-Priority': 'High',
                    'Importance': 'High',
                }
            };

            if (emailData.cc_emails && emailData.cc_emails.length > 0) {
                mailOptions.cc = emailData.cc_emails;
            }

            if (emailData.bcc_emails && emailData.bcc_emails.length > 0) {
                mailOptions.bcc = emailData.bcc_emails;
            }

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

            const info = await transporter.sendMail(mailOptions);
            
            const duration = Date.now() - startTime;
            logger.info(`✅ Email sent successfully to ${emailData.recipient_email}`, {
                messageId: info.messageId,
                queueId,
                campaignId,
                duration,
                from: 'rates@pasfreight.com'
            });

            await run(
                `UPDATE email_queue 
                 SET status = 'sent', 
                     sent_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ?`,
                [queueId]
            );

            await run(
                `INSERT INTO email_logs (email_queue_id, message_id, status, sent_at)
                 VALUES (?, ?, 'sent', datetime('now'))`,
                [queueId, info.messageId]
            );

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
            
            let errorMessage = error.message;
            if (errorMessage.includes('Invalid login') || errorMessage.includes('535')) {
                errorMessage = '❌ Invalid Brevo credentials! Please check SMTP Login and Key.';
            } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('timeout')) {
                errorMessage = '❌ SMTP connection failed. Try again later.';
            }
            
            logger.error(`Failed to send email to ${emailData.recipient_email}`, {
                error: errorMessage,
                queueId,
                campaignId,
                duration,
                from: 'rates@pasfreight.com'
            });

            await run(
                `UPDATE email_queue 
                 SET status = 'failed',
                     error_message = ?,
                     retry_count = retry_count + 1,
                     updated_at = datetime('now')
                 WHERE id = ?`,
                [errorMessage, queueId]
            );

            await run(
                `INSERT INTO email_logs (email_queue_id, status, error, sent_at)
                 VALUES (?, 'failed', ?, datetime('now'))`,
                [queueId, errorMessage]
            );

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
                error: errorMessage,
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