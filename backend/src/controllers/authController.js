import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { run, queryOne } from '../database/connection.js';
import logger from '../utils/logger.js';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

class AuthController {
    constructor() {
        this.register = this.register.bind(this);
        this.login = this.login.bind(this);
        this.googleLogin = this.googleLogin.bind(this);
        this.googleCallback = this.googleCallback.bind(this);
        this.logout = this.logout.bind(this);
        this.getProfile = this.getProfile.bind(this);
        this.changePassword = this.changePassword.bind(this);
        this.generateToken = this.generateToken.bind(this);
        this.createSession = this.createSession.bind(this);
        this.saveSmtpSettings = this.saveSmtpSettings.bind(this);
        this.getSmtpSettings = this.getSmtpSettings.bind(this);
        this.saveDefaultCcBcc = this.saveDefaultCcBcc.bind(this);
        this.getDefaultCcBcc = this.getDefaultCcBcc.bind(this);
    }

    generateToken(userId) {
        return jwt.sign(
            { userId, timestamp: Date.now() },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
    }

    async createSession(userId, token, req) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        
        await run(
            `INSERT INTO user_sessions (user_id, token, ip_address, user_agent, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [userId, token, req.ip || req.connection.remoteAddress, req.headers['user-agent'], expiresAt.toISOString()]
        );
    }

    // Google OAuth - Redirect to Google login
    async googleLogin(req, res) {
        try {
            const url = googleClient.generateAuthUrl({
                access_type: 'offline',
                scope: [
                    'https://www.googleapis.com/auth/userinfo.email',
                    'https://www.googleapis.com/auth/userinfo.profile',
                    'https://www.googleapis.com/auth/gmail.send'
                ],
                prompt: 'consent'
            });
            res.json({ success: true, url });
        } catch (error) {
            logger.error('Google login error:', error);
            res.status(500).json({ success: false, message: 'Failed to initiate Google login' });
        }
    }

    // Google OAuth Callback
    async googleCallback(req, res) {
        try {
            const { code } = req.query;

            if (!code) {
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=no_code`);
            }

            // Exchange code for tokens
            const { tokens } = await googleClient.getToken(code);
            googleClient.setCredentials(tokens);

            // Verify ID token and get user info
            const ticket = await googleClient.verifyIdToken({
                idToken: tokens.id_token,
                audience: process.env.GOOGLE_CLIENT_ID
            });

            const payload = ticket.getPayload();
            const email = payload.email;
            const fullName = payload.name || email.split('@')[0];
            const googleId = payload.sub;
            const picture = payload.picture;

            // ONLY allow @pasfreight.com emails
            if (!email.endsWith('@pasfreight.com')) {
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=invalid_domain`);
            }

            // Check if user exists
            let user = await queryOne('SELECT id, email, full_name, role, is_active FROM users WHERE email = ?', [email]);

            if (!user) {
                // Auto-register user
                const result = await run(
                    `INSERT INTO users (email, full_name, google_id, role, is_active, created_at)
                     VALUES (?, ?, ?, 'user', 1, datetime('now'))`,
                    [email, fullName, googleId]
                );
                user = {
                    id: result.lastID,
                    email,
                    full_name: fullName,
                    role: 'user',
                    is_active: 1
                };
            } else if (!user.is_active) {
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=account_deactivated`);
            }

            // Generate JWT token
            const token = this.generateToken(user.id);
            await this.createSession(user.id, token, req);

            // Update last login
            await run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);

            // Save Google refresh token if available
            if (tokens.refresh_token) {
                await run('UPDATE users SET google_refresh_token = ? WHERE id = ?', [tokens.refresh_token, user.id]);
            }

            // Redirect to frontend with token
            const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback?token=${token}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(fullName)}`;
            res.redirect(redirectUrl);

        } catch (error) {
            logger.error('Google callback error:', error);
            res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=auth_failed`);
        }
    }

    async register(req, res) {
        try {
            const { email, password, full_name } = req.body;
            
            const existingUser = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
            if (existingUser) {
                return res.status(400).json({ success: false, message: 'User already exists' });
            }
            
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);
            
            const result = await run(
                `INSERT INTO users (email, password_hash, full_name, role, created_at)
                 VALUES (?, ?, ?, 'user', datetime('now'))`,
                [email, passwordHash, full_name]
            );
            
            const token = this.generateToken(result.lastID);
            await this.createSession(result.lastID, token, req);
            
            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: { token, user: { id: result.lastID, email, full_name, role: 'user' } }
            });
        } catch (error) {
            logger.error('Registration error:', error);
            res.status(500).json({ success: false, message: 'Registration failed' });
        }
    }
    
    async login(req, res) {
        try {
            const { email, password } = req.body;
            
            const user = await queryOne(
                'SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE email = ?',
                [email]
            );
            
            if (!user) {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }
            
            if (!user.is_active) {
                return res.status(401).json({ success: false, message: 'Account is deactivated' });
            }
            
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }
            
            const token = this.generateToken(user.id);
            await this.createSession(user.id, token, req);
            
            await run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);
            
            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    token,
                    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
                }
            });
        } catch (error) {
            logger.error('Login error:', error);
            res.status(500).json({ success: false, message: 'Login failed' });
        }
    }
    
    async logout(req, res) {
        try {
            if (req.token) {
                await run('DELETE FROM user_sessions WHERE token = ?', [req.token]);
            }
            res.json({ success: true, message: 'Logout successful' });
        } catch (error) {
            logger.error('Logout error:', error);
            res.status(500).json({ success: false, message: 'Logout failed' });
        }
    }
    
    async getProfile(req, res) {
        try {
            const user = await queryOne(
                'SELECT id, email, full_name, role, created_at, last_login FROM users WHERE id = ?',
                [req.user.id]
            );
            
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            
            res.json({ success: true, data: { user } });
        } catch (error) {
            logger.error('Get profile error:', error);
            res.status(500).json({ success: false, message: 'Failed to get profile' });
        }
    }
    
    async changePassword(req, res) {
        try {
            const { current_password, new_password } = req.body;
            const user = await queryOne('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
            
            if (!user.password_hash) {
                return res.status(400).json({ success: false, message: 'Google login users cannot change password here' });
            }
            
            const isValid = await bcrypt.compare(current_password, user.password_hash);
            if (!isValid) {
                return res.status(401).json({ success: false, message: 'Current password is incorrect' });
            }
            
            const salt = await bcrypt.genSalt(10);
            const newPasswordHash = await bcrypt.hash(new_password, salt);
            
            await run('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?', [newPasswordHash, req.user.id]);
            await run('DELETE FROM user_sessions WHERE user_id = ? AND token != ?', [req.user.id, req.token]);
            
            res.json({ success: true, message: 'Password changed successfully' });
        } catch (error) {
            logger.error('Change password error:', error);
            res.status(500).json({ success: false, message: 'Failed to change password' });
        }
    }

    async saveSmtpSettings(req, res) {
        try {
            const { smtp_email, smtp_password } = req.body;
            
            await run(
                'UPDATE users SET smtp_email = ?, smtp_password = ?, updated_at = datetime("now") WHERE id = ?',
                [smtp_email, smtp_password, req.user.id]
            );
            
            logger.info(`SMTP settings saved for user ${req.user.id}`);
            res.json({ success: true, message: 'SMTP settings saved successfully' });
        } catch (error) {
            logger.error('Save SMTP settings error:', error);
            res.status(500).json({ success: false, message: 'Failed to save SMTP settings' });
        }
    }

    async getSmtpSettings(req, res) {
        try {
            const user = await queryOne('SELECT smtp_email FROM users WHERE id = ?', [req.user.id]);
            res.json({
                success: true,
                data: {
                    smtp_email: user?.smtp_email || req.user.email,
                    smtp_password: '********'
                }
            });
        } catch (error) {
            logger.error('Get SMTP settings error:', error);
            res.status(500).json({ success: false, message: 'Failed to get SMTP settings' });
        }
    }

    async saveDefaultCcBcc(req, res) {
        try {
            const { default_cc, default_bcc } = req.body;
            await run(
                'UPDATE users SET default_cc = ?, default_bcc = ?, updated_at = datetime("now") WHERE id = ?',
                [default_cc || '', default_bcc || '', req.user.id]
            );
            res.json({ success: true, message: 'Default CC/BCC saved' });
        } catch (error) {
            logger.error('Save default CC/BCC error:', error);
            res.status(500).json({ success: false, message: 'Failed to save default CC/BCC' });
        }
    }

    async getDefaultCcBcc(req, res) {
        try {
            const user = await queryOne('SELECT default_cc, default_bcc FROM users WHERE id = ?', [req.user.id]);
            res.json({
                success: true,
                data: { default_cc: user?.default_cc || '', default_bcc: user?.default_bcc || '' }
            });
        } catch (error) {
            logger.error('Get default CC/BCC error:', error);
            res.status(500).json({ success: false, message: 'Failed to get default CC/BCC' });
        }
    }
}

export default new AuthController();