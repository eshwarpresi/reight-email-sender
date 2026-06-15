import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    TextField,
    Button,
    Typography,
    LinearProgress,
    Alert,
    Chip,
    Stack,
} from '@mui/material';
import { Send as SendIcon, AttachFile as AttachFileIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

export default function SimpleEmail() {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState([]);
    const [formData, setFormData] = useState({
        from_email: '',
        from_password: '',
        to_emails: '',
        subject: '',
        content: '',
    });
    const [attachment, setAttachment] = useState(null);
    const [hasSavedSettings, setHasSavedSettings] = useState(false);
    const [showCredentials, setShowCredentials] = useState(false);
    const [fixedEmails, setFixedEmails] = useState([]);
    const [originalInvalidCount, setOriginalInvalidCount] = useState(0);

    // Advanced email fixing function - NO SKIPPING, ALL EMAILS WILL BE SENT
    const fixAndExtractEmails = (emailString) => {
        // First, split by common separators: new line, comma, semicolon, space
        let allEmails = [];
        
        // Split by new lines first
        const lines = emailString.split(/\n/);
        
        for (const line of lines) {
            // Check if line contains multiple emails separated by ; or ,
            if (line.includes(';') || line.includes(',')) {
                const separated = line.split(/[;,]/);
                for (const sep of separated) {
                    allEmails.push(sep.trim());
                }
            } else {
                allEmails.push(line.trim());
            }
        }
        
        const extractedEmails = [];
        
        for (const email of allEmails) {
            if (!email) continue;
            
            let extracted = email;
            
            // Remove HTML tags and brackets
            extracted = extracted.replace(/[<>]/g, '');
            
            // Extract email from "Name <email@domain.com>" or "Name email@domain.com" format
            const emailMatch = extracted.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) {
                extracted = emailMatch[0];
            }
            
            // Remove any remaining special characters
            extracted = extracted.replace(/[\[\](){}]/g, '');
            
            // Fix common domain issues
            if (extracted.includes('@') && !extracted.includes('.com') && !extracted.includes('.cn') && !extracted.includes('.net') && !extracted.includes('.org')) {
                // Try to add .com if missing
                const atIndex = extracted.indexOf('@');
                const domain = extracted.substring(atIndex + 1);
                if (domain && !domain.includes('.')) {
                    extracted = extracted + '.com';
                }
            }
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(extracted)) {
                extractedEmails.push(extracted.toLowerCase());
            } else if (extracted.includes('@')) {
                // Still try to send even if format is unusual
                extractedEmails.push(extracted.toLowerCase());
            }
        }
        
        // Remove duplicates while preserving order
        const uniqueEmails = [];
        const seen = new Set();
        for (const email of extractedEmails) {
            if (!seen.has(email)) {
                seen.add(email);
                uniqueEmails.push(email);
            }
        }
        
        return uniqueEmails;
    };

    // Send email with retry logic
    const sendEmailWithRetry = async (email, attempt = 1) => {
        try {
            const formDataToSend = new FormData();
            formDataToSend.append('from_email', formData.from_email);
            formDataToSend.append('from_password', formData.from_password);
            formDataToSend.append('to_email', email);
            formDataToSend.append('subject', formData.subject);
            formDataToSend.append('content', formData.content);
            if (attachment) {
                formDataToSend.append('attachment', attachment);
            }

            await api.post('/send-single-email', formDataToSend, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 30000
            });
            
            return { success: true, email, attempt };
        } catch (error) {
            if (attempt < 3) {
                // Retry up to 3 times with increasing delay
                await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
                return sendEmailWithRetry(email, attempt + 1);
            }
            return { 
                success: false, 
                email, 
                error: error.response?.data?.message || error.message || 'Failed after 3 attempts'
            };
        }
    };

    const handleSend = async () => {
        if (!formData.from_email) {
            toast.error('Please enter your Gmail address or save it in Settings');
            return;
        }
        if (!formData.from_password) {
            toast.error('Please enter your Gmail App Password or save it in Settings');
            return;
        }
        if (!formData.to_emails) {
            toast.error('Please enter recipient emails');
            return;
        }
        if (!formData.subject) {
            toast.error('Please enter subject');
            return;
        }
        if (!formData.content) {
            toast.error('Please enter message');
            return;
        }

        // Extract and fix all emails (NO SKIPPING)
        const allEmails = fixAndExtractEmails(formData.to_emails);
        
        if (allEmails.length === 0) {
            toast.error('No email addresses found. Please check your input.');
            return;
        }

        setFixedEmails(allEmails);
        setLoading(true);
        setProgress(0);
        setResults([]);

        let sent = 0;
        let failed = 0;
        const failedEmails = [];

        // Send emails one by one with delay and retry
        for (let i = 0; i < allEmails.length; i++) {
            const email = allEmails[i];
            
            // Add delay between emails (2 seconds)
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            const result = await sendEmailWithRetry(email);
            
            if (result.success) {
                sent++;
                setResults(prev => [...prev, { email: result.email, status: 'sent', attempt: result.attempt }]);
            } else {
                failed++;
                failedEmails.push({ email: result.email, error: result.error });
                setResults(prev => [...prev, { email: result.email, status: 'failed', error: result.error, attempt: result.attempt }]);
            }
            
            // Update progress
            setProgress(((i + 1) / allEmails.length) * 100);
        }

        setLoading(false);
        
        // Show summary
        if (failed === 0) {
            toast.success(`✅ Success! All ${sent} emails sent successfully!`);
        } else {
            toast.warning(`⚠️ Completed: ${sent} sent, ${failed} failed. Retry failed emails from History page.`);
            console.log('Failed emails:', failedEmails);
        }
    };

    // Quill modules configuration
    const quillModules = {
        toolbar: [
            [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            ['link', 'image', 'video'],
            ['clean']
        ],
    };

    const quillFormats = [
        'header', 'bold', 'italic', 'underline', 'strike',
        'color', 'background', 'list', 'bullet',
        'link', 'image', 'video'
    ];

    // Load saved SMTP settings
    useEffect(() => {
        loadSavedSettings();
    }, []);

    const loadSavedSettings = async () => {
        try {
            const response = await api.get('/auth/smtp-settings');
            if (response.data.data && response.data.data.smtp_email) {
                setFormData(prev => ({
                    ...prev,
                    from_email: response.data.data.smtp_email,
                    from_password: response.data.data.smtp_password,
                }));
                setHasSavedSettings(true);
                toast.success('Loaded your saved Gmail settings!');
            }
        } catch (error) {
            console.error('Failed to load SMTP settings:', error);
        }
    };

    return (
        <Box sx={{ maxWidth: 1000, mx: 'auto', mt: 4 }}>
            <Paper sx={{ p: 4 }}>
                <Typography variant="h4" gutterBottom align="center">
                    Bulk Email Sender
                </Typography>
                <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 4 }}>
                    Each recipient receives a separate email - No BCC, completely private
                </Typography>

                <Stack spacing={3}>
                    {hasSavedSettings && (
                        <Alert severity="success">
                            ✓ Your Gmail credentials are loaded from Settings. 
                            <Button 
                                size="small" 
                                onClick={() => setShowCredentials(!showCredentials)}
                                sx={{ ml: 2 }}
                            >
                                {showCredentials ? 'Hide' : 'Show'} Credentials
                            </Button>
                        </Alert>
                    )}

                    {!hasSavedSettings && (
                        <Alert severity="info">
                            <strong>Save your Gmail credentials once in Settings page!</strong> 
                            Go to Settings → Gmail SMTP Settings to save your email and app password permanently.
                        </Alert>
                    )}

                    <Alert severity="warning">
                        <strong>Email Tips:</strong>
                        <ul style={{ margin: '8px 0 0 20px' }}>
                            <li>Gmail allows ~500 emails per day</li>
                            <li>2 second delay between emails to avoid rate limiting</li>
                            <li>Auto-fixes invalid email formats (no emails are skipped)</li>
                            <li>Each email retries up to 3 times if failed</li>
                        </ul>
                    </Alert>

                    <TextField
                        fullWidth
                        label="Your Gmail Address"
                        type="email"
                        placeholder="youremail@gmail.com"
                        value={formData.from_email}
                        onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
                        required
                        helperText={hasSavedSettings ? "✓ Loaded from saved settings" : "Enter once or save in Settings"}
                        disabled={hasSavedSettings && !showCredentials}
                    />

                    <TextField
                        fullWidth
                        label="Gmail App Password"
                        type="password"
                        placeholder="16-character app password"
                        value={formData.from_password}
                        onChange={(e) => setFormData({ ...formData, from_password: e.target.value })}
                        required
                        helperText="Generate from Google Account → App Passwords"
                        disabled={hasSavedSettings && !showCredentials}
                    />

                    <TextField
                        fullWidth
                        label="Recipient Emails"
                        multiline
                        rows={6}
                        placeholder="Paste email addresses (supports formats like:&#10;email@domain.com&#10;Name &lt;email@domain.com&gt;&#10;email1@domain.com; email2@domain.com&#10;email@domain.com, another@domain.com"
                        value={formData.to_emails}
                        onChange={(e) => setFormData({ ...formData, to_emails: e.target.value })}
                        required
                        helperText="Auto-fixes invalid formats - every email will be sent!"
                    />

                    <TextField
                        fullWidth
                        label="Subject"
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        required
                    />

                    <Box>
                        <Typography variant="subtitle1" gutterBottom>
                            Message (Rich Text - Supports Images)
                        </Typography>
                        <Typography variant="caption" color="textSecondary" gutterBottom display="block">
                            💡 Tip: You can copy-paste images directly from clipboard or take screenshots!
                        </Typography>
                        <ReactQuill
                            theme="snow"
                            value={formData.content}
                            onChange={(value) => setFormData({ ...formData, content: value })}
                            modules={quillModules}
                            formats={quillFormats}
                            style={{ height: 300, marginBottom: 50 }}
                            placeholder="Write your email message here..."
                        />
                    </Box>

                    <Button
                        variant="outlined"
                        component="label"
                        startIcon={<AttachFileIcon />}
                    >
                        Add File Attachment (Optional)
                        <input
                            type="file"
                            hidden
                            onChange={(e) => setAttachment(e.target.files[0])}
                        />
                    </Button>
                    {attachment && (
                        <Chip label={attachment.name} onDelete={() => setAttachment(null)} />
                    )}

                    {loading && (
                        <Box>
                            <LinearProgress variant="determinate" value={progress} />
                            <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                                Sending {fixedEmails.length} emails... {Math.round(progress)}% (2 sec delay between emails)
                            </Typography>
                        </Box>
                    )}

                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        startIcon={<SendIcon />}
                        onClick={handleSend}
                        disabled={loading}
                        sx={{ py: 1.5 }}
                    >
                        {loading ? 'Sending...' : 'Send to All Recipients'}
                    </Button>

                    {results.length > 0 && (
                        <Paper variant="outlined" sx={{ p: 2, maxHeight: 300, overflow: 'auto' }}>
                            <Typography variant="subtitle2" gutterBottom>
                                Results: {results.filter(r => r.status === 'sent').length} sent, {results.filter(r => r.status === 'failed').length} failed
                            </Typography>
                            {results.map((r, i) => (
                                <Typography key={i} variant="body2" color={r.status === 'sent' ? 'success.main' : 'error.main'}>
                                    {r.email}: {r.status} {r.error && `- ${r.error}`} {r.attempt && r.attempt > 1 && `(retried ${r.attempt} times)`}
                                </Typography>
                            ))}
                        </Paper>
                    )}
                </Stack>
            </Paper>
        </Box>
    );
}