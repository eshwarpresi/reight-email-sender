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
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
} from '@mui/material';
import { 
    Send as SendIcon, 
    Upload as UploadIcon, 
    Preview as PreviewIcon,
    Delete as DeleteIcon,
    Add as AddIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import api from '../services/api';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

export default function PersonalizedEmail() {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [recipients, setRecipients] = useState([]);
    const [template, setTemplate] = useState('');
    const [subject, setSubject] = useState('');
    const [fromEmail, setFromEmail] = useState('');
    const [fromPassword, setFromPassword] = useState('');
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState([]);
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
                setFromEmail(response.data.data.smtp_email);
                setFromPassword(response.data.data.smtp_password);
                setHasSavedSettings(true);
                toast.success('Loaded your saved Gmail settings!');
            }
        } catch (error) {
            console.error('Failed to load SMTP settings:', error);
        }
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            // Try to detect headers from first row
            const headers = rows[0];
            let nameColIndex = -1;
            let emailColIndex = -1;
            
            // Find column indices for Name and Email
            for (let i = 0; i < headers.length; i++) {
                const header = String(headers[i] || '').toLowerCase().trim();
                if (header === 'name' || header === 'names') {
                    nameColIndex = i;
                }
                if (header === 'email' || header === 'emails') {
                    emailColIndex = i;
                }
            }
            
            // If headers not found, assume first col is Name, second is Email
            if (nameColIndex === -1) nameColIndex = 0;
            if (emailColIndex === -1) emailColIndex = 1;
            
            // Parse rows (skip header row if it exists)
            const startRow = headers.some(h => 
                String(h || '').toLowerCase().includes('name') || 
                String(h || '').toLowerCase().includes('email')
            ) ? 1 : 0;
            
            const parsedRecipients = [];
            for (let i = startRow; i < rows.length; i++) {
                const row = rows[i];
                if (!row) continue;
                
                const name = row[nameColIndex] ? String(row[nameColIndex]).trim() : '';
                const email = row[emailColIndex] ? String(row[emailColIndex]).trim() : '';
                
                if (email && email.includes('@') && email !== 'Email') {
                    parsedRecipients.push({
                        name: name || 'Customer',
                        email: email
                    });
                }
            }
            
            setRecipients(parsedRecipients);
            toast.success(`Loaded ${parsedRecipients.length} recipients`);
        };
        reader.readAsArrayBuffer(file);
    };

    const handleAddManually = () => {
        const name = prompt('Enter name:');
        const email = prompt('Enter email:');
        if (name && email) {
            setRecipients([...recipients, { name, email }]);
        }
    };

    const handleRemoveRecipient = (index) => {
        const newRecipients = [...recipients];
        newRecipients.splice(index, 1);
        setRecipients(newRecipients);
    };

    const handlePreview = () => {
        const previews = recipients.slice(0, 5).map(r => ({
            email: r.email,
            name: r.name,
            message: template.replace(/{NAME}/g, r.name || 'Valued Customer'),
        }));
        setPreviewData(previews);
        setPreviewOpen(true);
    };

    const handleSend = async () => {
        if (!fromEmail) {
            toast.error('Please enter your Gmail address or save it in Settings');
            return;
        }
        if (!fromPassword) {
            toast.error('Please enter your Gmail App Password or save it in Settings');
            return;
        }
        if (!subject) {
            toast.error('Please enter subject');
            return;
        }
        if (!template) {
            toast.error('Please enter message template with {NAME}');
            return;
        }
        if (recipients.length === 0) {
            toast.error('Please add recipients via Excel file or manually');
            return;
        }

        setLoading(true);
        setProgress(0);

        let sent = 0;
        let failed = 0;

        // Send 5 emails at a time for faster processing
        const CONCURRENT_LIMIT = 5;
        
        for (let i = 0; i < recipients.length; i += CONCURRENT_LIMIT) {
            const batch = recipients.slice(i, i + CONCURRENT_LIMIT);
            
            const promises = batch.map(async (recipient) => {
                const personalizedMessage = template.replace(/{NAME}/g, recipient.name || 'Valued Customer');
                
                try {
                    const formData = new FormData();
                    formData.append('from_email', fromEmail);
                    formData.append('from_password', fromPassword);
                    formData.append('to_email', recipient.email);
                    formData.append('subject', subject);
                    formData.append('content', personalizedMessage);

                    await api.post('/send-single-email', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    
                    return { success: true, email: recipient.email };
                } catch (error) {
                    return { success: false, email: recipient.email, error: error.message };
                }
            });
            
            const batchResults = await Promise.all(promises);
            
            for (const result of batchResults) {
                if (result.success) {
                    sent++;
                } else {
                    failed++;
                    console.error(`Failed to send to ${result.email}:`, result.error);
                }
            }
            
            setProgress(Math.min(((i + CONCURRENT_LIMIT) / recipients.length) * 100, 100));
        }

        setLoading(false);
        toast.success(`Completed! Sent: ${sent}, Failed: ${failed}`);
    };

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', mt: 4 }}>
            <Paper sx={{ p: 4 }}>
                <Typography variant="h4" gutterBottom align="center">
                    Personalized Bulk Email Sender
                </Typography>
                <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 4 }}>
                    Each email is personalized with recipient's name - Upload Excel/CSV file
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
                        <strong>How it works:</strong>
                        <ol style={{ margin: '8px 0 0 20px' }}>
                            <li>Upload Excel/CSV file with columns: <strong>Name, Email</strong></li>
                            <li>Write your message template using <strong>{'{NAME}'}</strong> as placeholder</li>
                            <li>Use rich text editor to add images, format text, etc.</li>
                            <li>System replaces {'{NAME}'} with each person's name automatically</li>
                            <li>Send personalized emails to everyone (5 at a time for speed)</li>
                        </ol>
                    </Alert>

                    <TextField
                        fullWidth
                        label="Your Gmail Address"
                        type="email"
                        placeholder="youremail@gmail.com"
                        value={fromEmail}
                        onChange={(e) => setFromEmail(e.target.value)}
                        required
                        helperText={hasSavedSettings ? "✓ Loaded from saved settings" : "Enter once or save in Settings"}
                        disabled={hasSavedSettings && !showCredentials}
                    />

                    <TextField
                        fullWidth
                        label="Gmail App Password"
                        type="password"
                        placeholder="16-character app password"
                        value={fromPassword}
                        onChange={(e) => setFromPassword(e.target.value)}
                        required
                        helperText="Generate from Google Account → App Passwords"
                        disabled={hasSavedSettings && !showCredentials}
                    />

                    <TextField
                        fullWidth
                        label="Email Subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                    />

                    <Box>
                        <Typography variant="subtitle1" gutterBottom>
                            Message Template (Rich Text - Supports Images)
                        </Typography>
                        <Typography variant="caption" color="textSecondary" gutterBottom display="block">
                            💡 Tip: Use {'{NAME}'} as placeholder - it will be replaced with each recipient's name
                            <br />
                            📸 You can copy-paste images directly from clipboard or take screenshots!
                        </Typography>
                        <ReactQuill
                            theme="snow"
                            value={template}
                            onChange={(value) => setTemplate(value)}
                            modules={quillModules}
                            formats={quillFormats}
                            style={{ height: 300, marginBottom: 50 }}
                            placeholder='Example:&#10;Hi {NAME},&#10;&#10;Your freight rates are ready.&#10;&#10;[You can paste images here]&#10;&#10;Best regards,&#10;Operations Team'
                        />
                    </Box>

                    <Box>
                        <Typography variant="subtitle1" gutterBottom>
                            Recipients List
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <Button
                                variant="outlined"
                                component="label"
                                startIcon={<UploadIcon />}
                            >
                                Upload Excel/CSV
                                <input
                                    type="file"
                                    hidden
                                    accept=".xlsx,.xls,.csv"
                                    onChange={handleFileUpload}
                                />
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<AddIcon />}
                                onClick={handleAddManually}
                            >
                                Add Manually
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<PreviewIcon />}
                                onClick={handlePreview}
                                disabled={recipients.length === 0 || !template}
                            >
                                Preview
                            </Button>
                        </Box>

                        {recipients.length > 0 && (
                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Name</TableCell>
                                            <TableCell>Email</TableCell>
                                            <TableCell>Preview Message</TableCell>
                                            <TableCell>Action</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {recipients.slice(0, 10).map((r, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>{r.name}</TableCell>
                                                <TableCell>{r.email}</TableCell>
                                                <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {template.replace(/{NAME}/g, r.name || 'Valued Customer').replace(/<[^>]*>/g, '').substring(0, 50)}...
                                                </TableCell>
                                                <TableCell>
                                                    <IconButton size="small" onClick={() => handleRemoveRecipient(idx)}>
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                        {recipients.length > 10 && (
                            <Typography variant="caption" color="textSecondary">
                                + {recipients.length - 10} more recipients
                            </Typography>
                        )}
                    </Box>

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
                        disabled={loading || recipients.length === 0 || !template || !subject}
                        sx={{ py: 1.5 }}
                    >
                        {loading ? 'Sending Personalized Emails...' : `Send to ${recipients.length} Recipients`}
                    </Button>
                </Stack>
            </Paper>

            {/* Preview Dialog */}
            <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Email Preview (First 5 recipients)</DialogTitle>
                <DialogContent>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>To</TableCell>
                                    <TableCell>Message Preview</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {previewData.map((p, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>{p.email}</TableCell>
                                        <TableCell sx={{ whiteSpace: 'pre-wrap' }}>{p.message}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </DialogContent>
            </Dialog>
        </Box>
    );
}