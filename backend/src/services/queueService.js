import { run, query, queryOne } from '../database/connection.js';
import logger from '../utils/logger.js';
import emailService from './emailService.js';

class QueueService {
    constructor() {
        console.log('🔧 QueueService: Constructor called');
        this.isProcessing = false;
        this.processingInterval = null;
        // DO NOT auto-start - only start when explicitly called
        // this.startProcessor();
    }

    // Call this method to start the processor (for Render/local)
    startProcessor() {
        if (this.processingInterval) {
            console.log('⏸️ QueueService: Processor already running');
            return;
        }
        console.log('▶️ QueueService: Starting processor...');
        this.processingInterval = setInterval(() => {
            this.processQueue();
        }, 5000);
        
        logger.info('Email queue processor started - Optimized for bulk sending');
        console.log('✅ QueueService: Processor started successfully');
    }

    async processQueue() {
        if (this.isProcessing) {
            console.log('⏸️ QueueService: Already processing, skipping...');
            return;
        }

        console.log('🔄 QueueService: Processing queue...');
        this.isProcessing = true;
        
        try {
            const pendingEmails = await query(
                `SELECT eq.*, c.subject, c.content, c.content_html 
                 FROM email_queue eq
                 LEFT JOIN campaigns c ON eq.campaign_id = c.id
                 WHERE eq.status IN ('pending', 'failed')
                 AND eq.retry_count < ?
                 ORDER BY eq.created_at ASC
                 LIMIT 20`,
                [parseInt(process.env.RETRY_ATTEMPTS) || 3]
            );

            if (pendingEmails.length === 0) {
                console.log('📭 QueueService: No pending emails');
                return;
            }

            console.log(`📧 QueueService: Processing ${pendingEmails.length} pending emails`);
            logger.info(`Processing ${pendingEmails.length} pending emails`);

            for (let i = 0; i < pendingEmails.length; i++) {
                const email = pendingEmails[i];
                console.log(`📨 QueueService: Sending to ${email.recipient_email}`);
                await this.processEmail(email);
                
                if (i < pendingEmails.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

        } catch (error) {
            console.error('❌ QueueService: Queue processing error:', error);
            logger.error('Queue processing error:', error);
        } finally {
            this.isProcessing = false;
            console.log('✅ QueueService: Queue processing complete');
        }
    }

    async processEmail(email) {
        try {
            console.log(`🔍 QueueService: Processing email ID ${email.id} to ${email.recipient_email}`);
            
            let userEmail = null;
            let userPassword = null;
            
            if (email.campaign_id) {
                console.log(`📋 QueueService: Getting credentials for campaign ${email.campaign_id}`);
                const campaign = await queryOne(
                    `SELECT u.smtp_email, u.smtp_password 
                     FROM campaigns c 
                     JOIN users u ON c.user_id = u.id 
                     WHERE c.id = ?`,
                    [email.campaign_id]
                );
                if (campaign && campaign.smtp_email) {
                    userEmail = campaign.smtp_email;
                    userPassword = campaign.smtp_password;
                    console.log(`✅ QueueService: Found user credentials from campaign`);
                }
            }
            
            if (!userEmail || !userPassword) {
                console.log(`📋 QueueService: Using environment credentials`);
                userEmail = process.env.SMTP_USER;
                userPassword = process.env.SMTP_PASSWORD;
                
                if (userEmail && userPassword) {
                    console.log(`📧 QueueService: Using environment credentials: ${userEmail}`);
                } else {
                    console.error(`❌ QueueService: No SMTP credentials available!`);
                    throw new Error('SMTP credentials not configured.');
                }
            }
            
            console.log(`📧 QueueService: Sending via ${userEmail}`);
            
            const emailData = {
                recipient_email: email.recipient_email,
                recipient_name: email.recipient_name,
                subject: email.subject,
                content: email.content,
                content_html: email.content_html,
                attachments: email.attachments ? JSON.parse(email.attachments) : [],
                cc_emails: email.cc_emails || '',
                bcc_emails: email.bcc_emails || ''
            };

            const result = await emailService.sendEmail(
                emailData,
                email.id,
                email.campaign_id,
                userEmail,
                userPassword
            );

            if (result.success) {
                console.log(`✅ QueueService: Email sent successfully to ${email.recipient_email}`);
                logger.info(`Email sent successfully to ${email.recipient_email}`);
            } else {
                console.error(`❌ QueueService: Failed to send to ${email.recipient_email}: ${result.error}`);
                logger.error(`Failed to send to ${email.recipient_email}: ${result.error}`);
            }

            return result;

        } catch (error) {
            console.error(`❌ QueueService: Error processing email ${email.id}:`, error);
            logger.error(`Error processing email ${email.id}:`, error);
            
            await run(
                `UPDATE email_queue 
                 SET retry_count = retry_count + 1,
                     error_message = ?,
                     updated_at = datetime('now')
                 WHERE id = ?`,
                [error.message, email.id]
            );
            
            return { success: false, error: error.message };
        }
    }

    async addToQueue(campaignId, recipients, subject, content, contentHtml, attachments, ccEmails = '', bccEmails = '') {
        console.log(`📝 QueueService: Adding ${recipients.length} emails to queue for campaign ${campaignId}`);
        const queueItems = [];
        
        for (const recipient of recipients) {
            const result = await run(
                `INSERT INTO email_queue 
                 (campaign_id, recipient_email, recipient_name, subject, content, content_html, attachments, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
                [
                    campaignId,
                    recipient.email,
                    recipient.name || null,
                    subject,
                    content,
                    contentHtml,
                    attachments ? JSON.stringify(attachments) : null
                ]
            );
            
            queueItems.push({
                id: result.lastID,
                ...recipient
            });
        }
        
        logger.info(`Added ${queueItems.length} emails to queue for campaign ${campaignId}`);
        console.log(`✅ QueueService: Added ${queueItems.length} emails to queue`);
        
        // Trigger immediate processing
        this.processQueue();
        
        return queueItems;
    }

    async addDirectToQueue(emails, fromEmail, fromPassword, subject, content, ccEmails = '', bccEmails = '') {
        console.log(`📝 QueueService: Adding ${emails.length} direct emails to queue`);
        const queueItems = [];
        
        for (const email of emails) {
            const result = await run(
                `INSERT INTO email_queue 
                 (campaign_id, recipient_email, recipient_name, subject, content, content_html, cc_emails, bcc_emails, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
                [
                    null,
                    email,
                    null,
                    subject,
                    content,
                    content,
                    ccEmails,
                    bccEmails
                ]
            );
            
            queueItems.push({
                id: result.lastID,
                email: email
            });
        }
        
        logger.info(`Added ${queueItems.length} direct emails to queue`);
        console.log(`✅ QueueService: Added ${queueItems.length} direct emails to queue`);
        this.processQueue();
        
        return queueItems;
    }

    async getQueueStatus(campaignId) {
        const stats = await queryOne(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
             FROM email_queue
             WHERE campaign_id = ? OR (campaign_id IS NULL AND ? = 0)`,
            [campaignId, campaignId || 0]
        );
        
        return stats;
    }

    async retryFailed(campaignId, emailIds = null) {
        let queryStr = `UPDATE email_queue SET status = 'pending', retry_count = retry_count + 1, error_message = NULL
                    WHERE status = 'failed'`;
        const params = [];
        
        if (campaignId && campaignId !== 0) {
            queryStr += ` AND campaign_id = ?`;
            params.push(campaignId);
        }
        
        if (emailIds && emailIds.length > 0) {
            const placeholders = emailIds.map(() => '?').join(',');
            queryStr += ` AND id IN (${placeholders})`;
            params.push(...emailIds);
        }
        
        const result = await run(queryStr, params);
        
        if (result.changes > 0) {
            logger.info(`Retrying ${result.changes} failed emails`);
            this.processQueue();
        }
        
        return result.changes;
    }

    async cancelQueue(campaignId) {
        const result = await run(
            `UPDATE email_queue 
             SET status = 'cancelled', 
                 updated_at = datetime('now')
             WHERE campaign_id = ? AND status IN ('pending', 'failed')`,
            [campaignId]
        );
        
        logger.info(`Cancelled ${result.changes} emails for campaign ${campaignId}`);
        return result.changes;
    }

    async getPendingCount() {
        const result = await queryOne(
            `SELECT COUNT(*) as count FROM email_queue WHERE status = 'pending'`
        );
        console.log(`📊 QueueService: ${result?.count || 0} emails pending`);
        return result?.count || 0;
    }

    stopProcessor() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
            logger.info('Email queue processor stopped');
            console.log('🛑 QueueService: Processor stopped');
        }
    }
}

// Export a singleton instance WITHOUT auto-starting
const queueServiceInstance = new QueueService();
export default queueServiceInstance;