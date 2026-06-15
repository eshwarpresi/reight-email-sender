import { run, queryOne } from './connection.js';
import logger from '../utils/logger.js';

export async function runMigrations() {
    try {
        // Check if cc_emails column exists
        const tableInfo = await queryOne("PRAGMA table_info(email_queue)");
        const columns = tableInfo ? Object.keys(tableInfo).map(key => tableInfo[key]) : [];
        
        const hasCcEmails = columns.some(col => col.name === 'cc_emails');
        const hasBccEmails = columns.some(col => col.name === 'bcc_emails');
        
        if (!hasCcEmails) {
            logger.info('Adding cc_emails column to email_queue...');
            await run('ALTER TABLE email_queue ADD COLUMN cc_emails TEXT');
        }
        
        if (!hasBccEmails) {
            logger.info('Adding bcc_emails column to email_queue...');
            await run('ALTER TABLE email_queue ADD COLUMN bcc_emails TEXT');
        }
        
        logger.info('Database migrations completed');
    } catch (error) {
        logger.error('Migration error:', error);
    }
}