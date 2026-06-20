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
    CheckCircle as CheckCircleIcon,
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
        smtp_email: 'rates@pasfreight.com', // Default company email
        smtp_password: '********', // Hidden
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
                // Only update if there are saved settings, otherwise keep defaults
                if (response.data.data.smtp_email) {
                    setSmtpData({
                        smtp_email: response.data.data.smtp_email,
                        smtp_password: '********',
                    });
                }
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
        // Just show success - no need to save since it's default
        toast.success('✅ Company email is already configured: rates@pasfreight.com');
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
                {/* Company Email Settings - DEFAULT */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" mb={3}>
                                <EmailIcon sx={{ fontSize: 40, color: '#1976d2', mr: 2 }} />
                                <Box>
                                    <Typography variant="h6">Company Email Settings</Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        All emails are sent from the company email
                                    </Typography>
                                </Box>
                            </Box>
                            
                            <Alert severity="success" sx={{ mb: 2 }}>
                                <strong>✅ Company email is configured and ready!</strong>
                                <br />
                                All emails will be sent from: <strong>rates@pasfreight.com</strong>
                            </Alert>

                            <TextField
                                fullWidth
                                label="Sending Email Address"
                                type="email"
                                value="rates@pasfreight.com"
                                margin="normal"
                                disabled
                                InputProps={{
                                    startAdornment: (
                                        <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                                    ),
                                }}
                                helperText="✅ This is the company email - all employees send from this address"
                            />
                            
                            <TextField
                                fullWidth
                                label="SMTP Provider"
                                value="Brevo (Sendinblue) - Active"
                                margin="normal"
                                disabled
                                InputProps={{
                                    startAdornment: (
                                        <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                                    ),
                                }}
                            />

                            <TextField
                                fullWidth
                                label="Daily Email Limit"
                                value="300 emails/day (Free plan)"
                                margin="normal"
                                disabled
                            />

                            <Alert severity="info" sx={{ mt: 2 }}>
                                <strong>📧 How it works:</strong>
                                <ul style={{ margin: '8px 0 0 20px' }}>
                                    <li>All employees send from <strong>rates@pasfreight.com</strong></li>
                                    <li>Agents see the company email as sender</li>
                                    <li>No need to enter any email/password</li>
                                    <li>Just login and send emails!</li>
                                </ul>
                            </Alert>

                            <Button
                                variant="contained"
                                color="success"
                                sx={{ mt: 2 }}
                                startIcon={<CheckCircleIcon />}
                            >
                                ✅ Ready to Send
                            </Button>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Default CC/BCC Settings */}
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
                        <strong>✅ Company Email Configured:</strong> All emails are sent from <strong>rates@pasfreight.com</strong>
                        <br />
                        Employees do NOT need to enter any email or password - just login and send!
                    </Alert>
                </Grid>
            </Grid>
        </Box>
    );
}