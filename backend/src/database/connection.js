import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

const getDatabasePath = () => {
    if (process.env.DATABASE_PATH) {
        return path.resolve(process.env.DATABASE_PATH);
    }
    if (process.env.RENDER) {
        return '/opt/render/project/src/backend/database/database.sqlite';
    }
    return path.resolve('./database.sqlite');
};

export async function getDatabase() {
    if (dbInstance) {
        return dbInstance;
    }

    const dbPath = getDatabasePath();
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    console.log(`📁 Database path: ${dbPath}`);

    dbInstance = await open({
        filename: dbPath,
        driver: sqlite3.Database,
        mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    });

    await dbInstance.run('PRAGMA foreign_keys = ON');
    await initializeDatabase(dbInstance);
    await runMigrations(dbInstance);
    
    console.log('✅ Database connected successfully');
    return dbInstance;
}

async function initializeDatabase(db) {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');
    const statements = schema.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
        try {
            await db.exec(statement);
        } catch (error) {
            if (!error.message.includes('duplicate column')) {
                console.error('Error executing schema statement:', error);
                throw error;
            }
        }
    }
    console.log('📊 Database initialized successfully');
}

async function runMigrations(db) {
    try {
        const userTableInfo = await db.all("PRAGMA table_info(users)");
        
        // Add default_cc
        if (!userTableInfo.some(col => col.name === 'default_cc')) {
            console.log('Adding default_cc column to users table...');
            await db.exec('ALTER TABLE users ADD COLUMN default_cc TEXT');
        }
        
        // Add default_bcc
        if (!userTableInfo.some(col => col.name === 'default_bcc')) {
            console.log('Adding default_bcc column to users table...');
            await db.exec('ALTER TABLE users ADD COLUMN default_bcc TEXT');
        }

        // Add google_id
        if (!userTableInfo.some(col => col.name === 'google_id')) {
            console.log('Adding google_id column to users table...');
            await db.exec('ALTER TABLE users ADD COLUMN google_id VARCHAR(255)');
        }

        // Add google_refresh_token
        if (!userTableInfo.some(col => col.name === 'google_refresh_token')) {
            console.log('Adding google_refresh_token column to users table...');
            await db.exec('ALTER TABLE users ADD COLUMN google_refresh_token TEXT');
        }
        
        // Check email_queue table
        const queueTableInfo = await db.all("PRAGMA table_info(email_queue)");
        
        if (!queueTableInfo.some(col => col.name === 'cc_emails')) {
            console.log('Adding cc_emails column to email_queue...');
            await db.exec('ALTER TABLE email_queue ADD COLUMN cc_emails TEXT');
        }
        
        if (!queueTableInfo.some(col => col.name === 'bcc_emails')) {
            console.log('Adding bcc_emails column to email_queue...');
            await db.exec('ALTER TABLE email_queue ADD COLUMN bcc_emails TEXT');
        }
        
        console.log('✅ Database migrations completed successfully');
    } catch (error) {
        console.error('Migration error:', error.message);
    }
}

export async function closeDatabase() {
    if (dbInstance) {
        await dbInstance.close();
        dbInstance = null;
        console.log('🔒 Database connection closed');
    }
}

export async function query(sql, params = []) {
    const db = await getDatabase();
    try {
        return await db.all(sql, params);
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

export async function queryOne(sql, params = []) {
    const db = await getDatabase();
    try {
        return await db.get(sql, params);
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

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