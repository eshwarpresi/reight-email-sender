import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

export async function getDatabase() {
    if (dbInstance) {
        return dbInstance;
    }

    const dbPath = path.resolve(process.env.DATABASE_PATH || './database.sqlite');
    
    // Ensure database directory exists
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    dbInstance = await open({
        filename: dbPath,
        driver: sqlite3.Database,
        mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    });

    // Enable foreign keys
    await dbInstance.run('PRAGMA foreign_keys = ON');
    
    // Initialize database schema
    await initializeDatabase(dbInstance);
    
    // Run migrations for existing database
    await runMigrations(dbInstance);
    
    return dbInstance;
}

async function initializeDatabase(db) {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');
    
    // Split schema into individual statements
    const statements = schema.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
        try {
            await db.exec(statement);
        } catch (error) {
            console.error('Error executing schema statement:', error);
            // Don't throw error for duplicate column errors
            if (!error.message.includes('duplicate column')) {
                throw error;
            }
        }
    }
    
    console.log('Database initialized successfully');
}

async function runMigrations(db) {
    try {
        // Check users table for default_cc and default_bcc columns
        const userTableInfo = await db.all("PRAGMA table_info(users)");
        const hasDefaultCc = userTableInfo.some(col => col.name === 'default_cc');
        const hasDefaultBcc = userTableInfo.some(col => col.name === 'default_bcc');
        
        if (!hasDefaultCc) {
            console.log('Adding default_cc column to users table...');
            await db.exec('ALTER TABLE users ADD COLUMN default_cc TEXT');
        }
        
        if (!hasDefaultBcc) {
            console.log('Adding default_bcc column to users table...');
            await db.exec('ALTER TABLE users ADD COLUMN default_bcc TEXT');
        }
        
        // Check email_queue table for cc_emails and bcc_emails columns
        const queueTableInfo = await db.all("PRAGMA table_info(email_queue)");
        const hasCcEmails = queueTableInfo.some(col => col.name === 'cc_emails');
        const hasBccEmails = queueTableInfo.some(col => col.name === 'bcc_emails');
        
        if (!hasCcEmails) {
            console.log('Adding cc_emails column to email_queue...');
            await db.exec('ALTER TABLE email_queue ADD COLUMN cc_emails TEXT');
        }
        
        if (!hasBccEmails) {
            console.log('Adding bcc_emails column to email_queue...');
            await db.exec('ALTER TABLE email_queue ADD COLUMN bcc_emails TEXT');
        }
        
        console.log('Database migrations completed successfully');
    } catch (error) {
        console.error('Migration error:', error.message);
        // Don't throw - migrations are optional
    }
}

export async function closeDatabase() {
    if (dbInstance) {
        await dbInstance.close();
        dbInstance = null;
    }
}

// Helper function to run queries with error handling
export async function query(sql, params = []) {
    const db = await getDatabase();
    try {
        return await db.all(sql, params);
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

// Helper for single row queries
export async function queryOne(sql, params = []) {
    const db = await getDatabase();
    try {
        return await db.get(sql, params);
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

// Helper for running statements (INSERT, UPDATE, DELETE)
export async function run(sql, params = []) {
    const db = await getDatabase();
    try {
        const result = await db.run(sql, params);
        return result;
    } catch (error) {
        console.error('Database run error:', error);
        throw error;
    }
}

// Transaction helper
export async function transaction(callback) {
    const db = await getDatabase();
    try {
        await db.run('BEGIN TRANSACTION');
        const result = await callback(db);
        await db.run('COMMIT');
        return result;
    } catch (error) {
        await db.run('ROLLBACK');
        throw error;
    }
}