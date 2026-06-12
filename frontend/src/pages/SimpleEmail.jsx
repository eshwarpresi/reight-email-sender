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

    // Quill modules configuration for image support
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

    // Load saved SMTP settings on component mount
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

        // Parse emails (comma, new line, or space separated)
        const emails = formData.to_emails.split(/[,\n\s]+/).filter(e => e.trim() && e.includes('@'));
        
        if (emails.length === 0) {
            toast.error('No valid email addresses found');
            return;
        }

        setLoading(true);
        setProgress(0);
        setResults([]);

        let sent = 0;
        let failed = 0;

        // Send 5 emails at a time for faster processing
        const CONCURRENT_LIMIT = 5;
        
        for (let i = 0; i < emails.length; i += CONCURRENT_LIMIT) {
            const batch = emails.slice(i, i + CONCURRENT_LIMIT);
            
            const promises = batch.map(async (email) => {
                try {
                    const formDataToSend = new FormData();
                    formDataToSend.append('from_email', formData.from_email);
                    formDataToSend.append('from_password', formData.from_password);
                    formDataToSend.append('to_email', email.trim());
                    formDataToSend.append('subject', formData.subject);
                    formDataToSend.append('content', formData.content);
                    if (attachment) {
                        formDataToSend.append('attachment', attachment);
                    }

                    await api.post('/send-single-email', formDataToSend, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    
                    return { email, status: 'sent', success: true };
                } catch (error) {
                    return { email, status: 'failed', error: error.response?.data?.message || 'Failed', success: false };
                }
            });
            
            const batchResults = await Promise.all(promises);
            
            for (const result of batchResults) {
                if (result.success) {
                    sent++;
                    setResults(prev => [...prev, { email: result.email, status: 'sent' }]);
                } else {
                    failed++;
                    setResults(prev => [...prev, { email: result.email, status: 'failed', error: result.error }]);
                }
            }
            
            setProgress(Math.min(((i + CONCURRENT_LIMIT) / emails.length) * 100, 100));
        }

        setLoading(false);
        toast.success(`Completed! Sent: ${sent}, Failed: ${failed}`);
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

                    <Alert severity="info">
                        <strong>Rich Text Editor:</strong> You can copy-paste images, format text, add links, and more!
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
                        placeholder="Enter email addresses (one per line or comma separated)&#10;example1@gmail.com&#10;example2@yahoo.com&#10;example3@outlook.com"
                        value={formData.to_emails}
                        onChange={(e) => setFormData({ ...formData, to_emails: e.target.value })}
                        required
                        helperText="Paste 100+ email addresses - each will receive individually"
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
                            placeholder="Write your email message here... You can paste images, format text, add links, etc."
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
                                Sending... {Math.round(progress)}% (5 emails at a time)
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
                            <Typography variant="subtitle2" gutterBottom>Results:</Typography>
                            {results.map((r, i) => (
                                <Typography key={i} variant="body2" color={r.status === 'sent' ? 'success.main' : 'error.main'}>
                                    {r.email}: {r.status} {r.error && `- ${r.error}`}
                                </Typography>
                            ))}
                        </Paper>
                    )}
                </Stack>
            </Paper>
        </Box>
    );
}
