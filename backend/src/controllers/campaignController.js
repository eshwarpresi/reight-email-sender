import { run, query, queryOne } from '../database/connection.js';
import queueService from '../services/queueService.js';
import emailService from '../services/emailService.js';
import logger from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

class CampaignController {
    async createCampaign(req, res) {
        try {
            const {
                name,
                subject,
                content,
                content_html,
                recipients,
                scheduled_for,
                attachments
            } = req.body;
            
            // Insert campaign without specifying id (auto-increment)
            const result = await run(
                `INSERT INTO campaigns 
                 (name, subject, content, content_html, status, total_recipients, user_id, scheduled_for, created_at)
                 VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, datetime('now'))`,
                [
                    name,
                    subject,
                    content,
                    content_html || content,
                    recipients.length,
                    req.user.id,
                    scheduled_for || null
                ]
            );
            
            const campaignId = result.lastID;
            
            // Save attachments if any
            if (attachments && attachments.length > 0) {
                for (const attachment of attachments) {
                    await run(
                        `INSERT INTO attachments 
                         (campaign_id, filename, original_name, file_path, file_size, mime_type, uploaded_by)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            campaignId,
                            attachment.filename,
                            attachment.original_name,
                            attachment.file_path,
                            attachment.file_size,
                            attachment.mime_type,
                            req.user.id
                        ]
                    );
                }
            }
            
            // Add to queue
            const queueItems = await queueService.addToQueue(
                campaignId,
                recipients,
                subject,
                content,
                content_html || content,
                attachments
            );
            
            // Update campaign status
            if (scheduled_for) {
                await run(
                    'UPDATE campaigns SET status = "scheduled" WHERE id = ?',
                    [campaignId]
                );
            }
            
            res.status(201).json({
                success: true,
                message: 'Campaign created and queued successfully',
                data: {
                    campaign_id: campaignId,
                    total_recipients: recipients.length,
                    queued: queueItems.length
                }
            });
            
        } catch (error) {
            logger.error('Create campaign error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create campaign',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
    
    async getCampaigns(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const offset = (page - 1) * limit;
            const status = req.query.status;
            
            let queryStr = `
                SELECT c.*, 
                       COUNT(DISTINCT eq.id) as total_emails,
                       SUM(CASE WHEN eq.status = 'sent' THEN 1 ELSE 0 END) as sent_emails,
                       SUM(CASE WHEN eq.status = 'failed' THEN 1 ELSE 0 END) as failed_emails
                FROM campaigns c
                LEFT JOIN email_queue eq ON c.id = eq.campaign_id
                WHERE c.user_id = ?
            `;
            
            const params = [req.user.id];
            
            if (status) {
                queryStr += ` AND c.status = ?`;
                params.push(status);
            }
            
            queryStr += ` GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            
            const campaigns = await query(queryStr, params);
            
            let countQuery = 'SELECT COUNT(*) as total FROM campaigns WHERE user_id = ?';
            const countParams = [req.user.id];
            
            if (status) {
                countQuery += ' AND status = ?';
                countParams.push(status);
            }
            
            const totalResult = await queryOne(countQuery, countParams);
            
            res.json({
                success: true,
                data: {
                    campaigns,
                    pagination: {
                        page,
                        limit,
                        total: totalResult.total,
                        pages: Math.ceil(totalResult.total / limit)
                    }
                }
            });
            
        } catch (error) {
            logger.error('Get campaigns error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get campaigns'
            });
        }
    }
    
    async getCampaignDetails(req, res) {
        try {
            const { id } = req.params;
            
            const campaign = await queryOne(
                `SELECT c.*, u.full_name as created_by
                 FROM campaigns c
                 JOIN users u ON c.user_id = u.id
                 WHERE c.id = ? AND c.user_id = ?`,
                [id, req.user.id]
            );
            
            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: 'Campaign not found'
                });
            }
            
            const queueStatus = await queueService.getQueueStatus(id);
            
            const recentEmails = await query(
                `SELECT eq.recipient_email, eq.recipient_name, eq.status, 
                        eq.error_message, eq.sent_at, eq.created_at
                 FROM email_queue eq
                 WHERE eq.campaign_id = ?
                 ORDER BY eq.created_at DESC
                 LIMIT 50`,
                [id]
            );
            
            const attachments = await query(
                'SELECT * FROM attachments WHERE campaign_id = ?',
                [id]
            );
            
            res.json({
                success: true,
                data: {
                    campaign,
                    queue_status: queueStatus,
                    recent_emails: recentEmails,
                    attachments
                }
            });
            
        } catch (error) {
            logger.error('Get campaign details error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get campaign details'
            });
        }
    }
    
    async cancelCampaign(req, res) {
        try {
            const { id } = req.params;
            
            const campaign = await queryOne(
                'SELECT status FROM campaigns WHERE id = ? AND user_id = ?',
                [id, req.user.id]
            );
            
            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: 'Campaign not found'
                });
            }
            
            if (campaign.status === 'completed') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot cancel completed campaign'
                });
            }
            
            const cancelled = await queueService.cancelQueue(id);
            
            await run(
                'UPDATE campaigns SET status = "cancelled", updated_at = datetime("now") WHERE id = ?',
                [id]
            );
            
            res.json({
                success: true,
                message: 'Campaign cancelled successfully',
                data: { cancelled_emails: cancelled }
            });
            
        } catch (error) {
            logger.error('Cancel campaign error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to cancel campaign'
            });
        }
    }
    
    async retryFailed(req, res) {
        try {
            const { id } = req.params;
            const { email_ids } = req.body;
            
            const campaign = await queryOne(
                'SELECT id FROM campaigns WHERE id = ? AND user_id = ?',
                [id, req.user.id]
            );
            
            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: 'Campaign not found'
                });
            }
            
            const retried = await queueService.retryFailed(id, email_ids);
            
            res.json({
                success: true,
                message: `Retrying ${retried} failed emails`,
                data: { retried }
            });
            
        } catch (error) {
            logger.error('Retry failed emails error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retry emails'
            });
        }
    }
    
    async exportCampaignReport(req, res) {
        try {
            const { id } = req.params;
            const format = req.query.format || 'csv';
            
            const emails = await query(
                `SELECT eq.recipient_email, eq.recipient_name, eq.status, 
                        eq.error_message, eq.sent_at, eq.created_at,
                        eq.retry_count
                 FROM email_queue eq
                 WHERE eq.campaign_id = ?
                 ORDER BY eq.created_at DESC`,
                [id]
            );
            
            if (format === 'excel') {
                const ExcelJS = await import('exceljs');
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Campaign Report');
                
                worksheet.columns = [
                    { header: 'Recipient Email', key: 'email', width: 30 },
                    { header: 'Recipient Name', key: 'name', width: 25 },
                    { header: 'Status', key: 'status', width: 15 },
                    { header: 'Error Message', key: 'error', width: 40 },
                    { header: 'Sent At', key: 'sent_at', width: 20 },
                    { header: 'Created At', key: 'created_at', width: 20 },
                    { header: 'Retry Count', key: 'retry_count', width: 12 }
                ];
                
                emails.forEach(email => {
                    worksheet.addRow({
                        email: email.recipient_email,
                        name: email.recipient_name,
                        status: email.status,
                        error: email.error_message,
                        sent_at: email.sent_at,
                        created_at: email.created_at,
                        retry_count: email.retry_count
                    });
                });
                
                worksheet.getRow(1).font = { bold: true };
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=campaign_${id}_report.xlsx`);
                
                await workbook.xlsx.write(res);
                res.end();
                
            } else {
                let csv = 'Recipient Email,Recipient Name,Status,Error Message,Sent At,Created At,Retry Count\n';
                
                emails.forEach(email => {
                    csv += `"${email.recipient_email}","${email.recipient_name || ''}","${email.status}","${(email.error_message || '').replace(/"/g, '""')}","${email.sent_at || ''}","${email.created_at}","${email.retry_count}"\n`;
                });
                
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename=campaign_${id}_report.csv`);
                res.send(csv);
            }
            
        } catch (error) {
            logger.error('Export campaign report error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export report'
            });
        }
    }
    
    async getDashboardStats(req, res) {
        try {
            const stats = await queryOne(
                `SELECT 
                    COUNT(DISTINCT c.id) as total_campaigns,
                    SUM(c.total_recipients) as total_recipients,
                    SUM(c.sent_count) as total_sent,
                    SUM(c.failed_count) as total_failed,
                    COUNT(DISTINCT CASE WHEN DATE(c.created_at) = DATE('now') THEN c.id END) as today_campaigns
                 FROM campaigns c
                 WHERE c.user_id = ?`,
                [req.user.id]
            );
            
            const recentCampaigns = await query(
                `SELECT id, name, status, total_recipients, sent_count, 
                        failed_count, created_at
                 FROM campaigns
                 WHERE user_id = ?
                 ORDER BY created_at DESC
                 LIMIT 10`,
                [req.user.id]
            );
            
            // Fixed: Specify which table's sent_at column to use (using email_logs.sent_at)
            const hourlyActivity = await query(
                `SELECT 
                    strftime('%H', el.sent_at) as hour,
                    COUNT(*) as count
                 FROM email_logs el
                 JOIN email_queue eq ON el.email_queue_id = eq.id
                 JOIN campaigns c ON eq.campaign_id = c.id
                 WHERE c.user_id = ? 
                 AND el.sent_at >= datetime('now', '-24 hours')
                 GROUP BY hour
                 ORDER BY hour`,
                [req.user.id]
            );
            
            const totalAttempts = (stats.total_sent || 0) + (stats.total_failed || 0);
            const successRate = totalAttempts > 0 ? (stats.total_sent / totalAttempts * 100).toFixed(2) : 0;
            
            res.json({
                success: true,
                data: {
                    overview: {
                        total_campaigns: stats.total_campaigns || 0,
                        total_recipients: stats.total_recipients || 0,
                        total_sent: stats.total_sent || 0,
                        total_failed: stats.total_failed || 0,
                        success_rate: successRate,
                        today_campaigns: stats.today_campaigns || 0
                    },
                    recent_campaigns: recentCampaigns,
                    hourly_activity: hourlyActivity
                }
            });
            
        } catch (error) {
            logger.error('Get dashboard stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get dashboard statistics'
            });
        }
    }
}

export default new CampaignController();