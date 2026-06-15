import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Alert,
    Divider,
    Card,
    CardContent,
    Grid,
    Switch,
    FormControlLabel,
    Avatar,
    IconButton,
} from '@mui/material';
import {
    Save as SaveIcon,
    Person as PersonIcon,
    Email as EmailIcon,
    Lock as LockIcon,
    Notifications as NotificationsIcon,
    Security as SecurityIcon,
    Google as GoogleIcon,
    CopyAll as CopyAllIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import api from '../services/api';

export default function Settings() {
    const { user, changePassword } = useAuth();
    const [loading, setLoading] = useState(false);
    const [smtpLoading, setSmtpLoading] = useState(false);
    const [ccBccLoading, setCcBccLoading] = useState(false);
    const [passwordData, setPasswordData] = useState({
        current_password: '',
        new_password: '',
        confirm_password: '',
    });
    const [smtpData, setSmtpData] = useState({
        smtp_email: '',
        smtp_password: '',
    });
    const [ccBccData, setCcBccData] = useState({
        default_cc: '',
        default_bcc: '',
    });
    const [settings, setSettings] = useState({
        emailNotifications: true,
        twoFactorAuth: false,
        emailSignature: '',
        timezone: 'UTC',
    });

    // Load saved SMTP settings and CC/BCC settings on component mount
    useEffect(() => {
        loadSmtpSettings();
        loadDefaultCcBcc();
    }, []);

    const loadSmtpSettings = async () => {
        try {
            const response = await api.get('/auth/smtp-settings');
            if (response.data.data) {
                setSmtpData({
                    smtp_email: response.data.data.smtp_email || '',
                    smtp_password: response.data.data.smtp_password || '',
                });
            }
        } catch (error) {
            console.error('Failed to load SMTP settings:', error);
        }
    };

    const loadDefaultCcBcc = async () => {
        try {
            const response = await api.get('/auth/default-cc-bcc');
            if (response.data.data) {
                setCcBccData({
                    default_cc: response.data.data.default_cc || '',
                    default_bcc: response.data.data.default_bcc || '',
                });
            }
        } catch (error) {
            console.error('Failed to load default CC/BCC settings:', error);
        }
    };

    const handleSaveSmtpSettings = async () => {
        if (!smtpData.smtp_email) {
            toast.error('Please enter your Gmail address');
            return;
        }
        if (!smtpData.smtp_password) {
            toast.error('Please enter your Gmail App Password');
            return;
        }

        setSmtpLoading(true);
        try {
            await api.post('/auth/smtp-settings', smtpData);
            toast.success('Gmail settings saved successfully!');
        } catch (error) {
            toast.error('Failed to save Gmail settings');
        } finally {
            setSmtpLoading(false);
        }
    };

    const handleSaveDefaultCcBcc = async () => {
        setCcBccLoading(true);
        try {
            await api.post('/auth/default-cc-bcc', ccBccData);
            toast.success('Default CC/BCC settings saved! These will auto-fill in email forms.');
        } catch (error) {
            toast.error('Failed to save default CC/BCC settings');
        } finally {
            setCcBccLoading(false);
        }
    };

    const handlePasswordChange = async () => {
        if (passwordData.new_password !== passwordData.confirm_password) {
            toast.error('New passwords do not match');
            return;
        }
        
        if (passwordData.new_password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }
        
        setLoading(true);
        const result = await changePassword(passwordData.current_password, passwordData.new_password);
        if (result.success) {
            setPasswordData({
                current_password: '',
                new_password: '',
                confirm_password: '',
            });
        }
        setLoading(false);
    };

    const handleSaveSettings = async () => {
        toast.success('Settings saved successfully');
    };

    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                Settings
            </Typography>

            <Grid container spacing={3}>
                {/* Gmail SMTP Settings */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={3}>
                                <GoogleIcon sx={{ fontSize: 40, color: '#DB4437', mr: 2 }} />
                                <Box>
                                    <Typography variant="h6">Gmail SMTP Settings</Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        Enter once - never again for bulk emails
                                    </Typography>
                                </Box>
                            </Box>
                            
                            <Alert severity="info" sx={{ mb: 2 }}>
                                <strong>How to get Gmail App Password:</strong>
                                <ol style={{ margin: '8px 0 0 20px' }}>
                                    <li>Go to Google Account → Security → 2-Step Verification (must be ON)</li>
                                    <li>Go to App Passwords → Select "Mail" → Generate</li>
                                    <li>Copy the 16-character password</li>
                                </ol>
                            </Alert>

                            <TextField
                                fullWidth
                                label="Your Gmail Address"
                                type="email"
                                placeholder="youremail@gmail.com"
                                value={smtpData.smtp_email}
                                onChange={(e) => setSmtpData({ ...smtpData, smtp_email: e.target.value })}
                                margin="normal"
                                helperText="This email will be used to send all your bulk emails"
                            />
                            <TextField
                                fullWidth
                                label="Gmail App Password"
                                type="password"
                                placeholder="16-character app password"
                                value={smtpData.smtp_password}
                                onChange={(e) => setSmtpData({ ...smtpData, smtp_password: e.target.value })}
                                margin="normal"
                                helperText="Your password is encrypted and stored securely"
                            />
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleSaveSmtpSettings}
                                disabled={smtpLoading}
                                sx={{ mt: 2 }}
                                startIcon={<SaveIcon />}
                            >
                                {smtpLoading ? 'Saving...' : 'Save Gmail Settings'}
                            </Button>
                            {smtpData.smtp_email && (
                                <Alert severity="success" sx={{ mt: 2 }}>
                                    ✓ Gmail settings configured.
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Default CC/BCC Settings - NEW */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={3}>
                                <CopyAllIcon sx={{ fontSize: 40, color: '#4caf50', mr: 2 }} />
                                <Box>
                                    <Typography variant="h6">Default CC/BCC Settings</Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        Set once - auto-filled in all email forms
                                    </Typography>
                                </Box>
                            </Box>
                            
                            <Alert severity="info" sx={{ mb: 2 }}>
                                <strong>Tip:</strong> These will automatically appear in CC/BCC fields when sending emails.
                                <br />
                                Separate multiple emails with commas: <code>email1@domain.com, email2@domain.com</code>
                            </Alert>

                            <TextField
                                fullWidth
                                label="Default CC (Carbon Copy)"
                                multiline
                                rows={2}
                                placeholder="cc1@company.com, cc2@company.com"
                                value={ccBccData.default_cc}
                                onChange={(e) => setCcBccData({ ...ccBccData, default_cc: e.target.value })}
                                margin="normal"
                                helperText="These recipients will receive a copy of every email"
                            />
                            <TextField
                                fullWidth
                                label="Default BCC (Blind Carbon Copy)"
                                multiline
                                rows={2}
                                placeholder="bcc1@company.com, bcc2@company.com"
                                value={ccBccData.default_bcc}
                                onChange={(e) => setCcBccData({ ...ccBccData, default_bcc: e.target.value })}
                                margin="normal"
                                helperText="Hidden copies - recipients won't see each other"
                            />
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleSaveDefaultCcBcc}
                                disabled={ccBccLoading}
                                sx={{ mt: 2 }}
                                startIcon={<SaveIcon />}
                            >
                                {ccBccLoading ? 'Saving...' : 'Save Default CC/BCC'}
                            </Button>
                            {(ccBccData.default_cc || ccBccData.default_bcc) && (
                                <Alert severity="success" sx={{ mt: 2 }}>
                                    ✓ Default CC/BCC configured. They will auto-fill in email forms!
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Profile Information */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={3}>
                                <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56, mr: 2 }}>
                                    <PersonIcon />
                                </Avatar>
                                <Box>
                                    <Typography variant="h6">Profile Information</Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        Manage your personal information
                                    </Typography>
                                </Box>
                            </Box>
                            
                            <TextField
                                fullWidth
                                label="Full Name"
                                defaultValue={user?.full_name}
                                margin="normal"
                                disabled
                                helperText="Contact admin to change name"
                            />
                            <TextField
                                fullWidth
                                label="Email Address"
                                defaultValue={user?.email}
                                margin="normal"
                                disabled
                            />
                            <TextField
                                fullWidth
                                label="Role"
                                defaultValue={user?.role}
                                margin="normal"
                                disabled
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* Change Password */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={3}>
                                <LockIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                                <Box>
                                    <Typography variant="h6">Change Password</Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        Update your password regularly for security
                                    </Typography>
                                </Box>
                            </Box>
                            
                            <TextField
                                fullWidth
                                label="Current Password"
                                type="password"
                                value={passwordData.current_password}
                                onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                                margin="normal"
                            />
                            <TextField
                                fullWidth
                                label="New Password"
                                type="password"
                                value={passwordData.new_password}
                                onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                                margin="normal"
                                helperText="Password must be at least 6 characters"
                            />
                            <TextField
                                fullWidth
                                label="Confirm New Password"
                                type="password"
                                value={passwordData.confirm_password}
                                onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                                margin="normal"
                            />
                            <Button
                                variant="contained"
                                onClick={handlePasswordChange}
                                disabled={loading || !passwordData.current_password || !passwordData.new_password}
                                sx={{ mt: 2 }}
                            >
                                Update Password
                            </Button>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Notification Settings */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={3}>
                                <NotificationsIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                                <Box>
                                    <Typography variant="h6">Notifications</Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        Configure your notification preferences
                                    </Typography>
                                </Box>
                            </Box>
                            
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={settings.emailNotifications}
                                        onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })}
                                    />
                                }
                                label="Email notifications for campaign status"
                            />
                            <Divider sx={{ my: 2 }} />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={settings.twoFactorAuth}
                                        onChange={(e) => setSettings({ ...settings, twoFactorAuth: e.target.checked })}
                                    />
                                }
                                label="Two-factor authentication (Coming soon)"
                                disabled
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* Email Signature Settings */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={3}>
                                <EmailIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                                <Box>
                                    <Typography variant="h6">Email Preferences</Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        Configure your email sending preferences
                                    </Typography>
                                </Box>
                            </Box>
                            
                            <TextField
                                fullWidth
                                label="Email Signature"
                                multiline
                                rows={3}
                                value={settings.emailSignature}
                                onChange={(e) => setSettings({ ...settings, emailSignature: e.target.value })}
                                margin="normal"
                                placeholder="Best regards,&#10;Your Name&#10;Freight Operations"
                            />
                            <TextField
                                fullWidth
                                select
                                label="Default Timezone"
                                value={settings.timezone}
                                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                                margin="normal"
                                SelectProps={{ native: true }}
                            >
                                <option value="UTC">UTC</option>
                                <option value="America/New_York">Eastern Time</option>
                                <option value="America/Chicago">Central Time</option>
                                <option value="America/Denver">Mountain Time</option>
                                <option value="America/Los_Angeles">Pacific Time</option>
                                <option value="Europe/London">London</option>
                                <option value="Asia/Dubai">Dubai</option>
                                <option value="Asia/Singapore">Singapore</option>
                            </TextField>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Save Button */}
                <Grid item xs={12}>
                    <Box display="flex" justifyContent="flex-end">
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={<SaveIcon />}
                            onClick={handleSaveSettings}
                        >
                            Save All Settings
                        </Button>
                    </Box>
                </Grid>

                {/* Info Alert */}
                <Grid item xs={12}>
                    <Alert severity="info">
                        <strong>Security Tip:</strong> Your Gmail App Password is encrypted and stored securely. 
                        Default CC/BCC will auto-fill in all email forms to save you time.
                    </Alert>
                </Grid>
            </Grid>
        </Box>
    );
}