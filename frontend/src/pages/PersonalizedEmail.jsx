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
    const [fixedRecipients, setFixedRecipients] = useState([]);
    const [template, setTemplate] = useState('');
    const [subject, setSubject] = useState('');
    const [fromEmail, setFromEmail] = useState('');
    const [fromPassword, setFromPassword] = useState('');
    const [ccEmails, setCcEmails] = useState('');
    const [bccEmails, setBccEmails] = useState('');
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [hasSavedSettings, setHasSavedSettings] = useState(false);
    const [showCredentials, setShowCredentials] = useState(false);
    const [sendResults, setSendResults] = useState([]);

    // Advanced email fixing
    const fixEmail = (email) => {
        if (!email) return null;
        
        let cleaned = email.toString().trim();
        cleaned = cleaned.replace(/[<>]/g, '');
        const emailMatch = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
            cleaned = emailMatch[0];
        }
        cleaned = cleaned.replace(/[\[\](){}]/g, '');
        if (cleaned.includes('@') && !cleaned.includes('.') && cleaned.split('@')[1].length > 0) {
            cleaned = cleaned + '.com';
        }
        return cleaned.toLowerCase();
    };

    // Fix all recipients when loaded
    useEffect(() => {
        const fixed = [];
        const originalCount = recipients.length;
        
        for (const recipient of recipients) {
            const fixedEmail = fixEmail(recipient.email);
            if (fixedEmail && fixedEmail.includes('@')) {
                fixed.push({
                    name: recipient.name || 'Customer',
                    email: fixedEmail,
                    originalEmail: recipient.email
                });
            } else if (recipient.email && recipient.email.includes('@')) {
                fixed.push({
                    name: recipient.name || 'Customer',
                    email: recipient.email.toLowerCase(),
                    originalEmail: recipient.email
                });
            }
        }
        
        setFixedRecipients(fixed);
        
        if (originalCount > 0 && fixed.length < originalCount) {
            toast.info(`Fixed ${originalCount - fixed.length} email(s) that had formatting issues`);
        }
    }, [recipients]);

    // Load default CC/BCC settings
    useEffect(() => {
        loadSavedSettings();
        loadDefaultCcBcc();
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

    const loadDefaultCcBcc = async () => {
        try {
            const response = await api.get('/auth/default-cc-bcc');
            if (response.data.data) {
                setCcEmails(response.data.data.default_cc || '');
                setBccEmails(response.data.data.default_bcc || '');
            }
        } catch (error) {
            console.error('Failed to load default CC/BCC:', error);
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
            
            const headers = rows[0];
            let nameColIndex = -1;
            let emailColIndex = -1;
            
            for (let i = 0; i < headers.length; i++) {
                const header = String(headers[i] || '').toLowerCase().trim();
                if (header === 'name' || header === 'names') {
                    nameColIndex = i;
                }
                if (header === 'email' || header === 'emails') {
                    emailColIndex = i;
                }
            }
            
            if (nameColIndex === -1) nameColIndex = 0;
            if (emailColIndex === -1) emailColIndex = 1;
            
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
                
                if (email && email !== 'Email' && email !== 'email') {
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
        const previews = fixedRecipients.slice(0, 5).map(r => ({
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
        if (fixedRecipients.length === 0) {
            toast.error('No recipients found. Please upload an Excel file or add manually.');
            return;
        }

        setLoading(true);
        setProgress(0);
        setSendResults([]);

        let sent = 0;
        let failed = 0;
        const batchSize = 5; // Send 5 emails at a time
        const delayBetweenBatches = 2000; // 2 seconds between batches

        // Process recipients in batches
        for (let i = 0; i < fixedRecipients.length; i += batchSize) {
            const batch = fixedRecipients.slice(i, i + batchSize);
            
            // Process batch concurrently
            const batchPromises = batch.map(async (recipient, batchIndex) => {
                const personalizedMessage = template.replace(/{NAME}/g, recipient.name || 'Valued Customer');
                
                try {
                    const formData = new FormData();
                    formData.append('from_email', fromEmail);
                    formData.append('from_password', fromPassword);
                    formData.append('to_email', recipient.email);
                    formData.append('cc_emails', ccEmails);
                    formData.append('bcc_emails', bccEmails);
                    formData.append('subject', subject);
                    formData.append('content', personalizedMessage);

                    await api.post('/send-single-email', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                        timeout: 60000 // 60 second timeout for individual emails
                    });
                    
                    return { success: true, email: recipient.email, name: recipient.name };
                } catch (error) {
                    let errorMsg = error.response?.data?.message || error.message || 'Failed';
                    return { success: false, email: recipient.email, name: recipient.name, error: errorMsg };
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            
            for (const result of batchResults) {
                if (result.success) {
                    sent++;
                    setSendResults(prev => [...prev, { 
                        email: result.email, 
                        name: result.name, 
                        status: 'sent'
                    }]);
                } else {
                    failed++;
                    setSendResults(prev => [...prev, { 
                        email: result.email, 
                        name: result.name, 
                        status: 'failed', 
                        error: result.error
                    }]);
                }
            }
            
            // Update progress
            setProgress(Math.min(((i + batchSize) / fixedRecipients.length) * 100, 100));
            
            // Delay between batches (except after last batch)
            if (i + batchSize < fixedRecipients.length) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }

        setLoading(false);
        
        if (failed === 0) {
            toast.success(`✅ Success! All ${sent} personalized emails sent successfully!`);
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

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', mt: 4 }}>
            <Paper sx={{ p: 4 }}>
                <Typography variant="h4" gutterBottom align="center">
                    Personalized Bulk Email Sender
                </Typography>
                <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 4 }}>
                    Each email is personalized with recipient's name - Optimized for 200+ emails
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
                        <strong>📧 Optimized Bulk Email Features:</strong>
                        <ul style={{ margin: '8px 0 0 20px' }}>
                            <li>✅ Handles 200+ emails smoothly with batch processing</li>
                            <li>✅ Sends 5 emails at a time for optimal performance</li>
                            <li>✅ 2 second delay between batches to respect Gmail limits</li>
                            <li>✅ <strong>CC:</strong> Carbon Copy - visible to all recipients</li>
                            <li>✅ <strong>BCC:</strong> Blind Carbon Copy - hidden from other recipients</li>
                            <li>✅ Use <strong>{'{NAME}'}</strong> for personalization</li>
                        </ul>
                    </Alert>

                    <TextField
                        fullWidth
                        label="Your Gmail Address"
                        type="email"
                        placeholder="youremail@gmail.com"
                        value={fromEmail}
                        onChange={(e) => setFromEmail(e.target.value)}
                        required
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
                        disabled={hasSavedSettings && !showCredentials}
                    />

                    <TextField
                        fullWidth
                        label="CC (Carbon Copy) - Optional"
                        multiline
                        rows={2}
                        placeholder="cc1@domain.com, cc2@domain.com"
                        value={ccEmails}
                        onChange={(e) => setCcEmails(e.target.value)}
                        helperText="These recipients will receive a copy (visible to all)"
                    />

                    <TextField
                        fullWidth
                        label="BCC (Blind Carbon Copy) - Optional"
                        multiline
                        rows={2}
                        placeholder="bcc1@domain.com, bcc2@domain.com"
                        value={bccEmails}
                        onChange={(e) => setBccEmails(e.target.value)}
                        helperText="Hidden copies - recipients won't see each other"
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
                            💡 Use {'{NAME}'} as placeholder - Auto replaced with each recipient's name
                        </Typography>
                        <ReactQuill
                            theme="snow"
                            value={template}
                            onChange={(value) => setTemplate(value)}
                            modules={quillModules}
                            formats={quillFormats}
                            style={{ height: 300, marginBottom: 50 }}
                            placeholder='Example:&#10;Hi {NAME},&#10;&#10;Your freight rates are ready.&#10;&#10;Best regards,&#10;Operations Team'
                        />
                    </Box>

                    <Box>
                        <Typography variant="subtitle1" gutterBottom>
                            Recipients List ({fixedRecipients.length} recipients)
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
                                Upload Excel/CSV
                                <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                            </Button>
                            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddManually}>
                                Add Manually
                            </Button>
                            <Button variant="outlined" startIcon={<PreviewIcon />} onClick={handlePreview} disabled={fixedRecipients.length === 0 || !template}>
                                Preview First 5
                            </Button>
                        </Box>

                        {fixedRecipients.length > 0 && (
                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Name</TableCell>
                                            <TableCell>Email</TableCell>
                                            <TableCell>Preview</TableCell>
                                            <TableCell>Action</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {fixedRecipients.slice(0, 10).map((r, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>{r.name}</TableCell>
                                                <TableCell>{r.email}</TableCell>
                                                <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {template.replace(/{NAME}/g, r.name || 'Customer').replace(/<[^>]*>/g, '').substring(0, 50)}...
                                                </TableCell>
                                                <TableCell>
                                                    <IconButton size="small" onClick={() => {
                                                        const newRecipients = [...recipients];
                                                        newRecipients.splice(idx, 1);
                                                        setRecipients(newRecipients);
                                                    }}>
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                        {fixedRecipients.length > 10 && (
                            <Typography variant="caption" color="textSecondary">
                                + {fixedRecipients.length - 10} more recipients
                            </Typography>
                        )}
                    </Box>

                    {loading && (
                        <Box>
                            <LinearProgress variant="determinate" value={progress} />
                            <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                                Sending {fixedRecipients.length} emails... {Math.round(progress)}% (5 emails per batch)
                            </Typography>
                        </Box>
                    )}

                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        startIcon={<SendIcon />}
                        onClick={handleSend}
                        disabled={loading || fixedRecipients.length === 0 || !template || !subject}
                        sx={{ py: 1.5 }}
                    >
                        {loading ? 'Sending...' : `Send to ${fixedRecipients.length} Recipients`}
                    </Button>

                    {sendResults.length > 0 && (
                        <Paper variant="outlined" sx={{ p: 2, maxHeight: 300, overflow: 'auto' }}>
                            <Typography variant="subtitle2" gutterBottom>
                                Results: {sendResults.filter(r => r.status === 'sent').length} sent, {sendResults.filter(r => r.status === 'failed').length} failed
                            </Typography>
                            {sendResults.slice(0, 20).map((r, i) => (
                                <Typography key={i} variant="body2" color={r.status === 'sent' ? 'success.main' : 'error.main'}>
                                    {r.name}: {r.email} - {r.status} {r.error && `(${r.error})`}
                                </Typography>
                            ))}
                            {sendResults.length > 20 && (
                                <Typography variant="body2" color="textSecondary">
                                    ... and {sendResults.length - 20} more results
                                </Typography>
                            )}
                        </Paper>
                    )}
                </Stack>
            </Paper>

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