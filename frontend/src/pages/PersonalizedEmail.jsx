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
    ContentPaste as ContentPasteIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import api from '../services/api';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// Company default email - all emails sent from this address
const COMPANY_EMAIL = 'rates@pasfreight.com';

export default function PersonalizedEmail() {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [recipients, setRecipients] = useState([]);
    const [fixedRecipients, setFixedRecipients] = useState([]);
    const [template, setTemplate] = useState('');
    const [subject, setSubject] = useState('');
    const [ccEmails, setCcEmails] = useState('');
    const [bccEmails, setBccEmails] = useState('');
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [sendResults, setSendResults] = useState([]);
    const [manualInput, setManualInput] = useState('');

    // Advanced email fixing - extracts email from any format
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

    // Extract name from format "Name <email@domain.com>" or "Name email@domain.com"
    const extractNameFromEmail = (text) => {
        if (!text) return '';
        let name = text.replace(/<[^>]*>/g, '').trim();
        name = name.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '').trim();
        return name || 'Customer';
    };

    // Parse manual input
    const parseManualInput = (input) => {
        if (!input.trim()) return [];
        
        const lines = input.split(/\n/);
        const parsed = [];
        let hasHeader = false;
        
        const firstLine = lines[0]?.toLowerCase() || '';
        if (firstLine.includes('name') && (firstLine.includes('email') || firstLine.includes('mail'))) {
            hasHeader = true;
        }
        
        for (let i = (hasHeader ? 1 : 0); i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            let name = '';
            let email = '';
            
            const angleBracketMatch = line.match(/<([^>]+)>/);
            if (angleBracketMatch) {
                email = angleBracketMatch[1];
                name = line.replace(/<[^>]*>/, '').trim();
            } else {
                let parts;
                if (line.includes('\t')) {
                    parts = line.split('\t');
                } else if (line.includes(',')) {
                    parts = line.split(',');
                } else {
                    parts = line.split(/\s{2,}/);
                }
                
                if (parts && parts.length >= 2) {
                    const first = parts[0].trim();
                    const second = parts[1].trim();
                    if (second.includes('@')) {
                        name = first;
                        email = second;
                    } else if (first.includes('@')) {
                        name = second;
                        email = first;
                    } else {
                        const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                        if (emailMatch) {
                            email = emailMatch[0];
                            name = extractNameFromEmail(line.replace(email, ''));
                        }
                    }
                } else {
                    const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                    if (emailMatch) {
                        email = emailMatch[0];
                        name = extractNameFromEmail(line.replace(email, ''));
                    }
                }
            }
            
            const fixedEmail = fixEmail(email);
            if (fixedEmail && fixedEmail.includes('@')) {
                parsed.push({
                    name: name || 'Customer',
                    email: fixedEmail
                });
            }
        }
        
        return parsed;
    };

    const handlePasteManual = () => {
        if (!manualInput.trim()) {
            toast.error('Please paste email addresses first');
            return;
        }
        
        const parsed = parseManualInput(manualInput);
        if (parsed.length === 0) {
            toast.error('No valid email addresses found. Please check the format.');
            return;
        }
        
        setRecipients([...recipients, ...parsed]);
        setManualInput('');
        toast.success(`Added ${parsed.length} recipients`);
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
        loadDefaultCcBcc();
    }, []);

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
        if (!subject) {
            toast.error('Please enter subject');
            return;
        }
        if (!template) {
            toast.error('Please enter message template with {NAME}');
            return;
        }
        if (fixedRecipients.length === 0) {
            toast.error('No recipients found. Please upload an Excel file, paste manually, or add manually.');
            return;
        }

        setLoading(true);
        setProgress(0);
        setSendResults([]);

        let sent = 0;
        let failed = 0;
        const batchSize = 5;
        const delayBetweenBatches = 2000;

        for (let i = 0; i < fixedRecipients.length; i += batchSize) {
            const batch = fixedRecipients.slice(i, i + batchSize);
            
            const batchPromises = batch.map(async (recipient) => {
                const personalizedMessage = template.replace(/{NAME}/g, recipient.name || 'Valued Customer');
                
                try {
                    const formData = new FormData();
                    // ✅ NO from_email or from_password - backend uses company email
                    formData.append('to_email', recipient.email);
                    formData.append('cc_emails', ccEmails);
                    formData.append('bcc_emails', bccEmails);
                    formData.append('subject', subject);
                    formData.append('content', personalizedMessage);

                    await api.post('/send-single-email', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                        timeout: 60000
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
            
            setProgress(Math.min(((i + batchSize) / fixedRecipients.length) * 100, 100));
            
            if (i + batchSize < fixedRecipients.length) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }

        setLoading(false);
        
        if (failed === 0) {
            toast.success(`✅ Success! All ${sent} personalized emails sent successfully from ${COMPANY_EMAIL}!`);
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
                    Each email is personalized with recipient's name - All emails sent from {COMPANY_EMAIL}
                </Typography>

                <Stack spacing={3}>
                    <Alert severity="success" sx={{ mb: 2 }}>
                        <strong>✅ Sending from:</strong> <strong style={{ fontSize: '1.1rem' }}>{COMPANY_EMAIL}</strong>
                        <br />
                        <small>All emails are sent from the company email address. No credentials needed!</small>
                    </Alert>

                    <Alert severity="info">
                        <strong>📧 Add Recipients in Multiple Ways:</strong>
                        <ul style={{ margin: '8px 0 0 20px' }}>
                            <li>📤 <strong>Upload:</strong> Excel/CSV file with Name, Email columns</li>
                            <li>📋 <strong>Paste:</strong> Copy-paste from any source (supports multiple formats)</li>
                            <li>➕ <strong>Add One by One:</strong> Manually add individual recipients</li>
                            <li>📧 <strong>Sender:</strong> {COMPANY_EMAIL} (company email)</li>
                        </ul>
                    </Alert>

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
                            Add Recipients
                        </Typography>

                        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                                📋 Paste from Excel/CSV/Email List
                            </Typography>
                            <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                                Supports formats: <code>Name, Email</code> or <code>Name &lt;email@domain.com&gt;</code> or just <code>email@domain.com</code>
                            </Typography>
                            <TextField
                                fullWidth
                                multiline
                                rows={4}
                                placeholder="Paste your list here...&#10;PAS, pasfreight@gmail.com&#10;KAVAN, kavan@pasfreight.com&#10;BHARATH &lt;imports@pasfreight.com&gt;&#10;SURESH sureshkumar@pasfreight.com"
                                value={manualInput}
                                onChange={(e) => setManualInput(e.target.value)}
                            />
                            <Button
                                variant="contained"
                                startIcon={<ContentPasteIcon />}
                                onClick={handlePasteManual}
                                sx={{ mt: 1 }}
                                disabled={!manualInput.trim()}
                            >
                                Add Pasted Recipients
                            </Button>
                        </Paper>

                        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                            <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
                                Upload Excel/CSV
                                <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                            </Button>
                            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddManually}>
                                Add One by One
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
                                Sending {fixedRecipients.length} emails from {COMPANY_EMAIL}... {Math.round(progress)}%
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