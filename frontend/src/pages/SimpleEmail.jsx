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
        cc_emails: '',
        bcc_emails: '',
        subject: '',
        content: '',
    });
    const [attachment, setAttachment] = useState(null);
    const [hasSavedSettings, setHasSavedSettings] = useState(false);
    const [showCredentials, setShowCredentials] = useState(false);
    const [fixedEmails, setFixedEmails] = useState([]);
    const [sentCount, setSentCount] = useState(0);
    const [failedCount, setFailedCount] = useState(0);

    // Advanced email fixing function
    const fixAndExtractEmails = (emailString) => {
        if (!emailString) return [];
        
        let allEmails = [];
        const lines = emailString.split(/\n/);
        
        for (const line of lines) {
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
            extracted = extracted.replace(/[<>]/g, '');
            const emailMatch = extracted.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) {
                extracted = emailMatch[0];
            }
            extracted = extracted.replace(/[\[\](){}]/g, '');
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(extracted)) {
                extractedEmails.push(extracted.toLowerCase());
            } else if (extracted.includes('@')) {
                extractedEmails.push(extracted.toLowerCase());
            }
        }
        
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

        const allEmails = fixAndExtractEmails(formData.to_emails);
        
        if (allEmails.length === 0) {
            toast.error('No valid email addresses found');
            return;
        }

        setFixedEmails(allEmails);
        setLoading(true);
        setProgress(0);
        setResults([]);
        setSentCount(0);
        setFailedCount(0);

        let sent = 0;
        let failed = 0;

        // Send emails one by one with delay
        for (let i = 0; i < allEmails.length; i++) {
            const email = allEmails[i];
            
            try {
                const formDataToSend = new FormData();
                formDataToSend.append('from_email', formData.from_email);
                formDataToSend.append('from_password', formData.from_password);
                formDataToSend.append('to_email', email);
                formDataToSend.append('cc_emails', formData.cc_emails);
                formDataToSend.append('bcc_emails', formData.bcc_emails);
                formDataToSend.append('subject', formData.subject);
                formDataToSend.append('content', formData.content);
                if (attachment) {
                    formDataToSend.append('attachment', attachment);
                }

                const response = await api.post('/send-single-email-direct', formDataToSend, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 120000 // Increased from 60 to 120 seconds
                });
                
                if (response.data.success) {
                    sent++;
                    setSentCount(sent);
                    setResults(prev => [...prev, { email, status: 'sent' }]);
                    toast.success(`✅ Sent to ${email}`);
                } else {
                    failed++;
                    setFailedCount(failed);
                    setResults(prev => [...prev, { email, status: 'failed', error: response.data.message || 'Failed' }]);
                    toast.error(`❌ Failed to send to ${email}`);
                }
            } catch (error) {
                failed++;
                setFailedCount(failed);
                const errorMsg = error.response?.data?.message || error.message || 'Failed';
                setResults(prev => [...prev, { email, status: 'failed', error: errorMsg }]);
                toast.error(`❌ Failed to send to ${email}`);
            }
            
            setProgress(((i + 1) / allEmails.length) * 100);
            
            if (i < allEmails.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        setLoading(false);
        
        if (failed === 0) {
            toast.success(`🎉 Success! All ${sent} emails sent successfully!`);
        } else {
            toast.warning(`⚠️ Completed: ${sent} sent, ${failed} failed. Check results below.`);
        }
    };

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

    // Load default CC/BCC settings
    useEffect(() => {
        loadSavedSettings();
        loadDefaultCcBcc();
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

    const loadDefaultCcBcc = async () => {
        try {
            const response = await api.get('/auth/default-cc-bcc');
            if (response.data.data) {
                setFormData(prev => ({
                    ...prev,
                    cc_emails: response.data.data.default_cc || '',
                    bcc_emails: response.data.data.default_bcc || '',
                }));
            }
        } catch (error) {
            console.error('Failed to load default CC/BCC:', error);
        }
    };

    return (
        <Box sx={{ maxWidth: 1000, mx: 'auto', mt: 4 }}>
            <Paper sx={{ p: 4 }}>
                <Typography variant="h4" gutterBottom align="center">
                    Bulk Email Sender
                </Typography>
                <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 4 }}>
                    Each recipient receives a separate email - With CC/BCC support
                </Typography>

                <Stack spacing={3}>
                    {hasSavedSettings && (
                        <Alert severity="success">
                            ✓ Your Gmail credentials are loaded from Settings. 
                            <Button size="small" onClick={() => setShowCredentials(!showCredentials)} sx={{ ml: 2 }}>
                                {showCredentials ? 'Hide' : 'Show'} Credentials
                            </Button>
                        </Alert>
                    )}

                    {!hasSavedSettings && (
                        <Alert severity="info">
                            <strong>Save your Gmail credentials once in Settings page!</strong>
                        </Alert>
                    )}

                    <Alert severity="info">
                        <strong>📧 Bulk Email Tips:</strong>
                        <ul style={{ margin: '8px 0 0 20px' }}>
                            <li><strong>Real-time sending:</strong> Each email sends one by one</li>
                            <li><strong>2 second delay</strong> between emails to avoid Gmail limits</li>
                            <li><strong>CC:</strong> Carbon Copy - visible to all recipients</li>
                            <li><strong>BCC:</strong> Blind Carbon Copy - hidden from other recipients</li>
                            <li>Timeout increased to 120 seconds for better reliability</li>
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
                        disabled={hasSavedSettings && !showCredentials}
                    />

                    <TextField
                        fullWidth
                        label="Recipient Emails (To)"
                        multiline
                        rows={4}
                        placeholder="Paste email addresses&#10;email1@domain.com&#10;email2@domain.com"
                        value={formData.to_emails}
                        onChange={(e) => setFormData({ ...formData, to_emails: e.target.value })}
                        required
                    />

                    <TextField
                        fullWidth
                        label="CC (Carbon Copy) - Optional"
                        multiline
                        rows={2}
                        placeholder="cc1@domain.com, cc2@domain.com"
                        value={formData.cc_emails}
                        onChange={(e) => setFormData({ ...formData, cc_emails: e.target.value })}
                        helperText="These recipients will be visible to everyone"
                    />

                    <TextField
                        fullWidth
                        label="BCC (Blind Carbon Copy) - Optional"
                        multiline
                        rows={2}
                        placeholder="bcc1@domain.com, bcc2@domain.com"
                        value={formData.bcc_emails}
                        onChange={(e) => setFormData({ ...formData, bcc_emails: e.target.value })}
                        helperText="Hidden from other recipients"
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
                        <ReactQuill
                            theme="snow"
                            value={formData.content}
                            onChange={(value) => setFormData({ ...formData, content: value })}
                            modules={quillModules}
                            formats={quillFormats}
                            style={{ height: 300, marginBottom: 50 }}
                        />
                    </Box>

                    <Button variant="outlined" component="label" startIcon={<AttachFileIcon />}>
                        Add File Attachment (Optional)
                        <input type="file" hidden onChange={(e) => setAttachment(e.target.files[0])} />
                    </Button>
                    {attachment && <Chip label={attachment.name} onDelete={() => setAttachment(null)} />}

                    {loading && (
                        <Box>
                            <LinearProgress variant="determinate" value={progress} />
                            <Typography variant="caption" color="textSecondary">
                                Sending {fixedEmails.length} emails... {Math.round(progress)}% ({sentCount} sent, {failedCount} failed)
                            </Typography>
                        </Box>
                    )}

                    <Button fullWidth variant="contained" size="large" startIcon={<SendIcon />} onClick={handleSend} disabled={loading}>
                        {loading ? `Sending ${fixedEmails.length} emails...` : `Send to ${fixedEmails.length} Recipients`}
                    </Button>

                    {results.length > 0 && (
                        <Paper variant="outlined" sx={{ p: 2, maxHeight: 300, overflow: 'auto' }}>
                            <Typography variant="subtitle2" gutterBottom>
                                Results: {results.filter(r => r.status === 'sent').length} sent, {results.filter(r => r.status === 'failed').length} failed
                            </Typography>
                            {results.slice(0, 20).map((r, i) => (
                                <Typography key={i} variant="body2" color={r.status === 'sent' ? 'success.main' : 'error.main'}>
                                    {r.email}: {r.status} {r.error && `- ${r.error}`}
                                </Typography>
                            ))}
                            {results.length > 20 && (
                                <Typography variant="body2" color="textSecondary">
                                    ... and {results.length - 20} more results
                                </Typography>
                            )}
                        </Paper>
                    )}
                </Stack>
            </Paper>
        </Box>
    );
}
