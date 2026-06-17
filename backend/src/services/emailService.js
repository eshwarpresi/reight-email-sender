import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import { run, queryOne } from '../database/connection.js';
import fs from 'fs/promises';
import path from 'path';

class EmailService {
    constructor() {
        this.transporter = null;
    }

    // Create transporter with user's credentials - SUPPORTS MULTIPLE PROVIDERS
    createTransporter(from_email, from_password) {
        // Auto-detect email provider based on domain
        const domain = from_email.split('@')[1]?.toLowerCase() || '';
        
        // Default: Gmail (including Google Workspace custom domains)
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

        // Gmail and Google Workspace domains (including custom domains like pasfreight.com)
        const gmailDomains = ['gmail.com', 'googlemail.com', 'pasfreight.com'];
        if (gmailDomains.some(d => domain === d)) {
            config = {
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
                    ciphers: 'SSLv3'
                },
                pool: false,
                maxConnections: 1,
                rateDelta: 3000,
            };
        }

        // Outlook/Hotmail/Live configuration
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
        
        // Brevo (Sendinblue) configuration
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

        // Yahoo configuration
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
    }

    async sendEmail(emailData, queueId, campaignId, userEmail, userPassword) {
        const startTime = Date.now();
        let transporter = null;
        
        try {
            logger.info(`Starting to send email to ${emailData.recipient_email}`);
            
            // Check if credentials exist
            if (!userEmail || !userPassword) {
                throw new Error('❌ No email credentials found! Please save your email settings in Settings page.');
            }
            
            // Create transporter with user's credentials
            transporter = this.createTransporter(userEmail, userPassword);
            
            // Verify connection before sending
            await transporter.verify();
            
            // Prepare email options with null safety
            const content = emailData.content || '';
            const contentHtml = emailData.content_html || content;
            
            const mailOptions = {
                from: userEmail,
                to: emailData.recipient_email,
                subject: emailData.subject || 'No Subject',
                html: contentHtml.replace(/\n/g, '<br>'),
                text: content.replace(/<[^>]*>/g, ''),
                replyTo: userEmail,
                headers: {
                    'X-Priority': '1',
                    'X-MSMail-Priority': 'High',
                    'Importance': 'High',
                    'X-Mailer': 'Freight Email Sender v2.0'
                }
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

            // Send email
            const info = await transporter.sendMail(mailOptions);
            
            const duration = Date.now() - startTime;
            logger.info(`✅ Email sent successfully to ${emailData.recipient_email}`, {
                messageId: info.messageId,
                queueId,
                campaignId,
                duration,
                from: userEmail
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
            
            // Log the specific error
            let errorMessage = error.message;
            if (errorMessage.includes('Invalid login') || errorMessage.includes('535')) {
                errorMessage = '❌ Invalid email credentials! Please check your email and App Password in Settings.';
            } else if (errorMessage.includes('ECONNREFUSED')) {
                errorMessage = '❌ SMTP connection refused. Please check your network.';
            } else if (errorMessage.includes('timeout')) {
                errorMessage = '❌ Connection timeout. Please try again later.';
            } else if (errorMessage.includes('verify')) {
                errorMessage = '❌ SMTP verification failed. Please check your email credentials.';
            }
            
            logger.error(`Failed to send email to ${emailData.recipient_email}`, {
                error: errorMessage,
                queueId,
                campaignId,
                duration,
                from: userEmail
            });

            // Update queue status with error
            await run(
                `UPDATE email_queue 
                 SET status = 'failed',
                     error_message = ?,
                     retry_count = retry_count + 1,
                     updated_at = datetime('now')
                 WHERE id = ?`,
                [errorMessage, queueId]
            );

            // Log error
            await run(
                `INSERT INTO email_logs (email_queue_id, status, error, sent_at)
                 VALUES (?, 'failed', ?, datetime('now'))`,
                [queueId, errorMessage]
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