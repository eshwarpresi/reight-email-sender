import { query, queryOne } from '../database/connection.js';
import logger from '../utils/logger.js';

class ReportController {
    async getEmailReports(req, res) {
        try {
            const { start_date, end_date, status, campaign_id } = req.query;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;
            
            let queryStr = `
                SELECT eq.*, c.name as campaign_name, c.subject as campaign_subject
                FROM email_queue eq
                JOIN campaigns c ON eq.campaign_id = c.id
                WHERE c.user_id = ?
            `;
            const params = [req.user.id];
            
            if (start_date) {
                queryStr += ` AND eq.created_at >= ?`;
                params.push(start_date);
            }
            
            if (end_date) {
                queryStr += ` AND eq.created_at <= ?`;
                params.push(end_date);
            }
            
            if (status) {
                queryStr += ` AND eq.status = ?`;
                params.push(status);
            }
            
            if (campaign_id) {
                queryStr += ` AND eq.campaign_id = ?`;
                params.push(campaign_id);
            }
            
            queryStr += ` ORDER BY eq.created_at DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            
            const emails = await query(queryStr, params);
            
            let countQuery = `
                SELECT COUNT(*) as total
                FROM email_queue eq
                JOIN campaigns c ON eq.campaign_id = c.id
                WHERE c.user_id = ?
            `;
            const countParams = [req.user.id];
            
            if (start_date) countParams.push(start_date);
            if (end_date) countParams.push(end_date);
            if (status) countParams.push(status);
            if (campaign_id) countParams.push(campaign_id);
            
            const totalResult = await queryOne(countQuery, countParams);
            
            res.json({
                success: true,
                data: {
                    emails,
                    pagination: {
                        page,
                        limit,
                        total: totalResult.total,
                        pages: Math.ceil(totalResult.total / limit)
                    }
                }
            });
            
        } catch (error) {
            logger.error('Get email reports error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get email reports'
            });
        }
    }
    
    async exportFullReport(req, res) {
        try {
            const { start_date, end_date } = req.query;
            
            let queryStr = `
                SELECT 
                    eq.recipient_email,
                    eq.recipient_name,
                    eq.status,
                    eq.error_message,
                    eq.sent_at,
                    eq.created_at,
                    c.name as campaign_name
                FROM email_queue eq
                JOIN campaigns c ON eq.campaign_id = c.id
                WHERE c.user_id = ?
            `;
            const params = [req.user.id];
            
            if (start_date) {
                queryStr += ` AND eq.created_at >= ?`;
                params.push(start_date);
            }
            
            if (end_date) {
                queryStr += ` AND eq.created_at <= ?`;
                params.push(end_date);
            }
            
            queryStr += ` ORDER BY eq.created_at DESC`;
            
            const emails = await query(queryStr, params);
            
            let csv = 'Campaign,Recipient Email,Recipient Name,Status,Error Message,Sent At,Created At\n';
            
            emails.forEach(email => {
                csv += `"${email.campaign_name}","${email.recipient_email}","${email.recipient_name || ''}","${email.status}","${(email.error_message || '').replace(/"/g, '""')}","${email.sent_at || ''}","${email.created_at}"\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=full_report_${Date.now()}.csv`);
            res.send(csv);
            
        } catch (error) {
            logger.error('Export full report error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export report'
            });
        }
    }
    
    async getCampaignAnalytics(req, res) {
        try {
            const campaignsOverTime = await query(
                `SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as total_campaigns,
                    SUM(total_recipients) as total_recipients,
                    SUM(sent_count) as total_sent,
                    SUM(failed_count) as total_failed
                 FROM campaigns
                 WHERE user_id = ?
                 AND created_at >= datetime('now', '-30 days')
                 GROUP BY DATE(created_at)
                 ORDER BY date DESC`,
                [req.user.id]
            );
            
            const topCampaigns = await query(
                `SELECT 
                    name,
                    total_recipients,
                    sent_count,
                    failed_count,
                    CAST(sent_count AS FLOAT) / NULLIF(total_recipients, 0) * 100 as success_rate
                 FROM campaigns
                 WHERE user_id = ? AND status = 'completed'
                 ORDER BY success_rate DESC
                 LIMIT 10`,
                [req.user.id]
            );
            
            const failureReasons = await query(
                `SELECT 
                    error_message,
                    COUNT(*) as count
                 FROM email_queue eq
                 JOIN campaigns c ON eq.campaign_id = c.id
                 WHERE c.user_id = ? AND eq.status = 'failed' AND eq.error_message IS NOT NULL
                 GROUP BY error_message
                 ORDER BY count DESC
                 LIMIT 10`,
                [req.user.id]
            );
            
            res.json({
                success: true,
                data: {
                    campaigns_over_time: campaignsOverTime,
                    top_campaigns: topCampaigns,
                    failure_reasons: failureReasons
                }
            });
            
        } catch (error) {
            logger.error('Get campaign analytics error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get campaign analytics'
            });
        }
    }
}

export default new ReportController();