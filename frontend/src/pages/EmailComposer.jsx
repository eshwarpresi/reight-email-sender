import React, { useState, useCallback } from 'react';
import {
    Box,
    Paper,
    TextField,
    Button,
    Typography,
    Stepper,
    Step,
    StepLabel,
    Chip,
    IconButton,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    LinearProgress,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    Card,
    CardContent,
    Divider,
} from '@mui/material';
import {
    Delete as DeleteIcon,
    Send as SendIcon,
    Add as AddIcon,
    CloudUpload as CloudUploadIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { campaigns, contacts } from '../services/api';
import { toast } from 'react-toastify';

const steps = ['Compose Email', 'Add Recipients', 'Preview & Send'];

export default function EmailComposer() {
    const [activeStep, setActiveStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [contactsList, setContactsList] = useState([]);
    const [selectedContacts, setSelectedContacts] = useState([]);
    const [customEmails, setCustomEmails] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        subject: '',
        content: '',
        scheduled_for: '',
    });

    React.useEffect(() => {
        fetchContacts();
    }, []);

    const fetchContacts = async () => {
        try {
            const response = await contacts.getAll({ limit: 1000 });
            setContactsList(response.data.data.contacts);
        } catch (error) {
            console.error('Failed to fetch contacts:', error);
        }
    };

    const handleFormChange = (field, value) => {
        setFormData({ ...formData, [field]: value });
    };

    const handleContactToggle = (contact) => {
        const isSelected = selectedContacts.find(c => c.email === contact.email);
        if (isSelected) {
            setSelectedContacts(selectedContacts.filter(c => c.email !== contact.email));
        } else {
            setSelectedContacts([...selectedContacts, { email: contact.email, name: contact.full_name }]);
        }
    };

    const handleAddCustomEmails = () => {
        const emails = customEmails.split(/[,\n]/).map(e => e.trim()).filter(e => e);
        const newContacts = emails.map(email => ({ email, name: '' }));
        setSelectedContacts([...selectedContacts, ...newContacts]);
        setCustomEmails('');
    };

    const handleRemoveRecipient = (email) => {
        setSelectedContacts(selectedContacts.filter(c => c.email !== email));
    };

    const handleAttachmentDrop = useCallback((acceptedFiles) => {
        const newAttachments = acceptedFiles.map(file => ({
            file,
            name: file.name,
            size: file.size,
            type: file.type,
        }));
        setAttachments([...attachments, ...newAttachments]);
    }, [attachments]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: handleAttachmentDrop,
        maxSize: 10485760,
        multiple: true,
    });

    const handleRemoveAttachment = (index) => {
        const newAttachments = [...attachments];
        newAttachments.splice(index, 1);
        setAttachments(newAttachments);
    };

    const handleSendEmail = async () => {
        if (selectedContacts.length === 0) {
            toast.error('Please add at least one recipient');
            return;
        }

        setLoading(true);
        
        const attachmentsData = [];
        for (const attachment of attachments) {
            attachmentsData.push({
                filename: attachment.file.name,
                original_name: attachment.file.name,
                file_path: `/uploads/${attachment.file.name}`,
                file_size: attachment.file.size,
                mime_type: attachment.file.type,
            });
        }

        const campaignData = {
            name: formData.name,
            subject: formData.subject,
            content: formData.content,
            content_html: formData.content,
            recipients: selectedContacts,
            attachments: attachmentsData,
            scheduled_for: formData.scheduled_for || null,
        };

        try {
            await campaigns.create(campaignData);
            toast.success(`Campaign created! Sending to ${selectedContacts.length} recipients`);
            
            setFormData({ name: '', subject: '', content: '', scheduled_for: '' });
            setSelectedContacts([]);
            setAttachments([]);
            setActiveStep(0);
        } catch (error) {
            toast.error('Failed to create campaign');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const renderStepContent = () => {
        switch (activeStep) {
            case 0:
                return (
                    <Box>
                        <TextField
                            fullWidth
                            label="Campaign Name"
                            value={formData.name}
                            onChange={(e) => handleFormChange('name', e.target.value)}
                            margin="normal"
                            required
                            helperText="Give your campaign a descriptive name"
                        />
                        <TextField
                            fullWidth
                            label="Email Subject"
                            value={formData.subject}
                            onChange={(e) => handleFormChange('subject', e.target.value)}
                            margin="normal"
                            required
                        />
                        <Typography variant="body2" sx={{ mt: 2, mb: 1 }}>
                            Email Content
                        </Typography>
                        <ReactQuill
                            theme="snow"
                            value={formData.content}
                            onChange={(value) => handleFormChange('content', value)}
                            style={{ height: 300, marginBottom: 50 }}
                        />
                        <TextField
                            fullWidth
                            label="Schedule Send (Optional)"
                            type="datetime-local"
                            value={formData.scheduled_for}
                            onChange={(e) => handleFormChange('scheduled_for', e.target.value)}
                            margin="normal"
                            InputLabelProps={{ shrink: true }}
                        />
                    </Box>
                );

            case 1:
                return (
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="h6" gutterBottom>
                                Contact Groups
                            </Typography>
                            <Paper sx={{ p: 2, maxHeight: 400, overflow: 'auto' }}>
                                {contactsList.map((contact) => (
                                    <ListItem
                                        key={contact.id}
                                        button
                                        onClick={() => handleContactToggle(contact)}
                                        selected={selectedContacts.some(c => c.email === contact.email)}
                                    >
                                        <ListItemText
                                            primary={contact.email}
                                            secondary={contact.full_name}
                                        />
                                    </ListItem>
                                ))}
                                {contactsList.length === 0 && (
                                    <Typography color="textSecondary" align="center">
                                        No contacts found. Add contacts first.
                                    </Typography>
                                )}
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Typography variant="h6" gutterBottom>
                                Custom Emails
                            </Typography>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                placeholder="Enter email addresses (one per line or comma separated)"
                                value={customEmails}
                                onChange={(e) => setCustomEmails(e.target.value)}
                                variant="outlined"
                            />
                            <Button
                                variant="contained"
                                onClick={handleAddCustomEmails}
                                sx={{ mt: 1 }}
                                startIcon={<AddIcon />}
                            >
                                Add Emails
                            </Button>
                            
                            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                                Selected Recipients ({selectedContacts.length})
                            </Typography>
                            <Paper sx={{ p: 2, maxHeight: 300, overflow: 'auto' }}>
                                {selectedContacts.map((contact) => (
                                    <ListItem key={contact.email}>
                                        <ListItemText
                                            primary={contact.email}
                                            secondary={contact.name || 'No name'}
                                        />
                                        <ListItemSecondaryAction>
                                            <IconButton edge="end" onClick={() => handleRemoveRecipient(contact.email)}>
                                                <DeleteIcon />
                                            </IconButton>
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                ))}
                                {selectedContacts.length === 0 && (
                                    <Typography color="textSecondary" align="center">
                                        No recipients selected
                                    </Typography>
                                )}
                            </Paper>
                        </Grid>
                    </Grid>
                );

            case 2:
                return (
                    <Box>
                        <Alert severity="info" sx={{ mb: 3 }}>
                            You are about to send this email to {selectedContacts.length} recipient(s)
                        </Alert>
                        
                        <Card variant="outlined" sx={{ mb: 3 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Campaign: {formData.name}
                                </Typography>
                                <Typography variant="subtitle1" gutterBottom>
                                    Subject: {formData.subject}
                                </Typography>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="body2" color="textSecondary" gutterBottom>
                                    Preview of email content:
                                </Typography>
                                <Box
                                    sx={{
                                        p: 2,
                                        bgcolor: '#f5f5f5',
                                        borderRadius: 1,
                                        maxHeight: 200,
                                        overflow: 'auto',
                                    }}
                                    dangerouslySetInnerHTML={{ __html: formData.content }}
                                />
                            </CardContent>
                        </Card>

                        <Typography variant="subtitle1" gutterBottom>
                            Attachments ({attachments.length})
                        </Typography>
                        <List>
                            {attachments.map((attachment, index) => (
                                <ListItem key={index}>
                                    <ListItemText
                                        primary={attachment.name}
                                        secondary={`${(attachment.size / 1024).toFixed(2)} KB`}
                                    />
                                    <ListItemSecondaryAction>
                                        <IconButton edge="end" onClick={() => handleRemoveAttachment(index)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                        </List>

                        <Typography variant="subtitle1" gutterBottom>
                            Recipients Preview (First 10)
                        </Typography>
                        <Paper sx={{ p: 2, maxHeight: 200, overflow: 'auto' }}>
                            {selectedContacts.slice(0, 10).map((contact) => (
                                <Chip
                                    key={contact.email}
                                    label={contact.email}
                                    sx={{ m: 0.5 }}
                                />
                            ))}
                            {selectedContacts.length > 10 && (
                                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                                    And {selectedContacts.length - 10} more...
                                </Typography>
                            )}
                        </Paper>
                    </Box>
                );
            
            default:
                return null;
        }
    };

    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                Compose Email Campaign
            </Typography>
            
            <Paper sx={{ p: 3 }}>
                <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
                    {steps.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {loading && <LinearProgress sx={{ mb: 2 }} />}

                {renderStepContent()}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
                    <Button
                        disabled={activeStep === 0}
                        onClick={() => setActiveStep(activeStep - 1)}
                    >
                        Back
                    </Button>
                    <Box>
                        {activeStep === steps.length - 1 ? (
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleSendEmail}
                                disabled={loading || selectedContacts.length === 0}
                                startIcon={<SendIcon />}
                            >
                                {loading ? 'Sending...' : 'Send Campaign'}
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                onClick={() => setActiveStep(activeStep + 1)}
                                disabled={
                                    (activeStep === 0 && (!formData.name || !formData.subject || !formData.content)) ||
                                    (activeStep === 1 && selectedContacts.length === 0)
                                }
                            >
                                Next
                            </Button>
                        )}
                    </Box>
                </Box>
            </Paper>

            <Paper
                {...getRootProps()}
                sx={{
                    p: 3,
                    mt: 3,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: isDragActive ? '#e3f2fd' : '#fafafa',
                    border: '2px dashed #ccc',
                    '&:hover': { bgcolor: '#f0f0f0' },
                }}
            >
                <input {...getInputProps()} />
                <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="body1">
                    {isDragActive
                        ? 'Drop files here...'
                        : 'Drag & drop attachments here, or click to select'}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                    Max file size: 10MB per file
                </Typography>
            </Paper>

            <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Email Preview</DialogTitle>
                <DialogContent>
                    <Typography variant="subtitle1" gutterBottom>
                        Subject: {formData.subject}
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <Box dangerouslySetInnerHTML={{ __html: formData.content }} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPreviewOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}