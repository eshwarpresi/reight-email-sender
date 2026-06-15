import { run, query, queryOne } from '../database/connection.js';
import logger from '../utils/logger.js';
import emailService from './emailService.js';

class QueueService {
    constructor() {
        this.isProcessing = false;
        this.processingInterval = null;
        this.startProcessor();
    }

    startProcessor() {
        // Process queue every 5 seconds (faster for better throughput)
        this.processingInterval = setInterval(() => {
            this.processQueue();
        }, 5000);
        
        logger.info('Email queue processor started - Optimized for bulk sending');
    }

    async processQueue() {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        
        try {
            // Get pending emails - increased limit for better throughput
            const pendingEmails = await query(
                `SELECT eq.*, c.subject, c.content, c.content_html 
                 FROM email_queue eq
                 JOIN campaigns c ON eq.campaign_id = c.id
                 WHERE eq.status IN ('pending', 'failed')
                 AND eq.retry_count < ?
                 ORDER BY eq.created_at ASC
                 LIMIT 20`,
                [parseInt(process.env.RETRY_ATTEMPTS) || 3]
            );

            if (pendingEmails.length === 0) {
                return;
            }

            logger.info(`Processing ${pendingEmails.length} pending emails (optimized batch)`);

            // Process emails with concurrency control (3 at a time)
            const concurrencyLimit = 3;
            for (let i = 0; i < pendingEmails.length; i += concurrencyLimit) {
                const batch = pendingEmails.slice(i, i + concurrencyLimit);
                const promises = batch.map(email => this.processEmail(email));
                await Promise.all(promises);
                
                // Small delay between batches to respect Gmail limits
                if (i + concurrencyLimit < pendingEmails.length) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

        } catch (error) {
            logger.error('Queue processing error:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async processEmail(email) {
        try {
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
                email.campaign_id
            );

            if (result.success) {
                logger.info(`Email sent successfully to ${email.recipient_email}`);
            } else {
                logger.error(`Failed to send to ${email.recipient_email}: ${result.error}`);
            }

            return result;

        } catch (error) {
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
        
        // Trigger immediate processing
        this.processQueue();
        
        return queueItems;
    }

    async addDirectToQueue(emails, fromEmail, fromPassword, subject, content, ccEmails = '', bccEmails = '') {
        const queueItems = [];
        
        for (const email of emails) {
            const result = await run(
                `INSERT INTO email_queue 
                 (campaign_id, recipient_email, recipient_name, subject, content, content_html, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
                [
                    null, // No campaign for direct sends
                    email,
                    null,
                    subject,
                    content,
                    content
                ]
            );
            
            queueItems.push({
                id: result.lastID,
                email: email
            });
        }
        
        logger.info(`Added ${queueItems.length} direct emails to queue`);
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
        return result?.count || 0;
    }

    stopProcessor() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
            logger.info('Email queue processor stopped');
        }
    }
}

export default new QueueService();