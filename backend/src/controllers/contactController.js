import { run, query, queryOne } from '../database/connection.js';
import logger from '../utils/logger.js';
import pkg from 'papaparse';
const { parse } = pkg;
import fs from 'fs/promises';

class ContactController {
    async addContact(req, res) {
        try {
            const { email, full_name, company_name, country, tags } = req.body;
            
            const existingContact = await queryOne(
                'SELECT id FROM contacts WHERE email = ? AND user_id = ?',
                [email, req.user.id]
            );
            
            if (existingContact) {
                await run(
                    `UPDATE contacts 
                     SET full_name = ?, company_name = ?, country = ?, tags = ?, updated_at = datetime('now')
                     WHERE id = ?`,
                    [full_name, company_name, country, tags ? JSON.stringify(tags) : null, existingContact.id]
                );
                
                return res.json({
                    success: true,
                    message: 'Contact updated successfully',
                    data: { id: existingContact.id }
                });
            }
            
            const result = await run(
                `INSERT INTO contacts (email, full_name, company_name, country, tags, user_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
                [email, full_name, company_name, country, tags ? JSON.stringify(tags) : null, req.user.id]
            );
            
            res.status(201).json({
                success: true,
                message: 'Contact added successfully',
                data: { id: result.lastID }
            });
            
        } catch (error) {
            logger.error('Add contact error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add contact'
            });
        }
    }
    
    async getContacts(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            
            let queryStr = 'SELECT * FROM contacts WHERE user_id = ?';
            const params = [req.user.id];
            
            if (search) {
                queryStr += ' AND (email LIKE ? OR full_name LIKE ? OR company_name LIKE ?)';
                const searchPattern = `%${search}%`;
                params.push(searchPattern, searchPattern, searchPattern);
            }
            
            queryStr += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);
            
            const contacts = await query(queryStr, params);
            
            let countQuery = 'SELECT COUNT(*) as total FROM contacts WHERE user_id = ?';
            const countParams = [req.user.id];
            
            if (search) {
                countQuery += ' AND (email LIKE ? OR full_name LIKE ? OR company_name LIKE ?)';
                countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }
            
            const totalResult = await queryOne(countQuery, countParams);
            
            res.json({
                success: true,
                data: {
                    contacts,
                    pagination: {
                        page,
                        limit,
                        total: totalResult.total,
                        pages: Math.ceil(totalResult.total / limit)
                    }
                }
            });
            
        } catch (error) {
            logger.error('Get contacts error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get contacts'
            });
        }
    }
    
    async importContacts(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }
            
            const fileContent = await fs.readFile(req.file.path, 'utf-8');
            let contacts = [];
            
            if (req.file.mimetype === 'text/csv') {
                const result = parse(fileContent, {
                    header: true,
                    skipEmptyLines: true
                });
                contacts = result.data;
            } else if (req.file.mimetype === 'application/json') {
                contacts = JSON.parse(fileContent);
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Unsupported file format. Please use CSV or JSON.'
                });
            }
            
            const inserted = [];
            const errors = [];
            
            for (let i = 0; i < contacts.length; i++) {
                const contact = contacts[i];
                const email = contact.email || contact.Email;
                
                if (!email || !this.validateEmail(email)) {
                    errors.push({ row: i + 1, error: 'Invalid email address' });
                    continue;
                }
                
                try {
                    const existing = await queryOne(
                        'SELECT id FROM contacts WHERE email = ? AND user_id = ?',
                        [email, req.user.id]
                    );
                    
                    if (existing) {
                        await run(
                            `UPDATE contacts 
                             SET full_name = ?, company_name = ?, updated_at = datetime('now')
                             WHERE id = ?`,
                            [contact.full_name || contact.name || null, contact.company_name || null, existing.id]
                        );
                        inserted.push({ email, status: 'updated' });
                    } else {
                        await run(
                            `INSERT INTO contacts (email, full_name, company_name, user_id, created_at)
                             VALUES (?, ?, ?, ?, datetime('now'))`,
                            [email, contact.full_name || contact.name || null, contact.company_name || null, req.user.id]
                        );
                        inserted.push({ email, status: 'inserted' });
                    }
                } catch (error) {
                    errors.push({ row: i + 1, error: error.message });
                }
            }
            
            await fs.unlink(req.file.path);
            
            res.json({
                success: true,
                message: `Imported ${inserted.length} contacts successfully`,
                data: {
                    total: contacts.length,
                    inserted: inserted.length,
                    errors: errors
                }
            });
            
        } catch (error) {
            logger.error('Import contacts error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to import contacts'
            });
        }
    }
    
    async deleteContact(req, res) {
        try {
            const { id } = req.params;
            
            const result = await run(
                'DELETE FROM contacts WHERE id = ? AND user_id = ?',
                [id, req.user.id]
            );
            
            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Contact not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Contact deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete contact error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete contact'
            });
        }
    }
    
    async createGroup(req, res) {
        try {
            const { name, description, contact_ids } = req.body;
            
            const result = await run(
                `INSERT INTO contact_groups (name, description, user_id, created_at)
                 VALUES (?, ?, ?, datetime('now'))`,
                [name, description, req.user.id]
            );
            
            const groupId = result.lastID;
            
            if (contact_ids && contact_ids.length > 0) {
                for (const contactId of contact_ids) {
                    await run(
                        'INSERT OR IGNORE INTO group_members (group_id, contact_id) VALUES (?, ?)',
                        [groupId, contactId]
                    );
                }
            }
            
            res.status(201).json({
                success: true,
                message: 'Group created successfully',
                data: { id: groupId }
            });
            
        } catch (error) {
            logger.error('Create group error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create group'
            });
        }
    }
    
    async getGroups(req, res) {
        try {
            const groups = await query(
                `SELECT g.*, COUNT(gm.contact_id) as contact_count
                 FROM contact_groups g
                 LEFT JOIN group_members gm ON g.id = gm.group_id
                 WHERE g.user_id = ?
                 GROUP BY g.id
                 ORDER BY g.created_at DESC`,
                [req.user.id]
            );
            
            res.json({
                success: true,
                data: { groups }
            });
            
        } catch (error) {
            logger.error('Get groups error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get groups'
            });
        }
    }
    
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
}

export default new ContactController();