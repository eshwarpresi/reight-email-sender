import { run, queryOne } from './connection.js';
import logger from '../utils/logger.js';

export async function runMigrations() {
    try {
        // Get all columns from email_queue
        const queueTableInfo = await queryOne("PRAGMA table_info(email_queue)");
        
        if (!queueTableInfo) {
            logger.info('email_queue table does not exist yet');
            return;
        }
        
        // Get all columns from users
        const userTableInfo = await queryOne("PRAGMA table_info(users)");
        
        // ---- email_queue columns ----
        
        // Check cc_emails
        const result1 = await queryOne("SELECT * FROM email_queue LIMIT 1");
        if (result1) {
            try {
                await run('ALTER TABLE email_queue ADD COLUMN cc_emails TEXT');
                logger.info('Added cc_emails column to email_queue');
            } catch (e) {
                if (!e.message.includes('duplicate column')) throw e;
            }
            
            try {
                await run('ALTER TABLE email_queue ADD COLUMN bcc_emails TEXT');
                logger.info('Added bcc_emails column to email_queue');
            } catch (e) {
                if (!e.message.includes('duplicate column')) throw e;
            }
        }
        
        // ---- users columns ----
        
        if (userTableInfo) {
            try {
                await run('ALTER TABLE users ADD COLUMN google_id VARCHAR(255)');
                logger.info('Added google_id column to users');
            } catch (e) {
                if (!e.message.includes('duplicate column')) throw e;
            }
            
            try {
                await run('ALTER TABLE users ADD COLUMN google_refresh_token TEXT');
                logger.info('Added google_refresh_token column to users');
            } catch (e) {
                if (!e.message.includes('duplicate column')) throw e;
            }
            
            try {
                await run('ALTER TABLE users ADD COLUMN default_cc TEXT');
                logger.info('Added default_cc column to users');
            } catch (e) {
                if (!e.message.includes('duplicate column')) throw e;
            }
            
            try {
                await run('ALTER TABLE users ADD COLUMN default_bcc TEXT');
                logger.info('Added default_bcc column to users');
            } catch (e) {
                if (!e.message.includes('duplicate column')) throw e;
            }
        }
        
        logger.info('✅ Database migrations completed');
    } catch (error) {
        logger.error('Migration error:', error);
    }
}