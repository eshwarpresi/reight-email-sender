import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    TextField,
    Button,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    Chip,
    InputAdornment,
    Alert,
    LinearProgress,
    Tabs,
    Tab,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
} from '@mui/material';
import {
    Search as SearchIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Upload as UploadIcon,
    GroupAdd as GroupAddIcon,
    Download as DownloadIcon,
} from '@mui/icons-material';
import { contacts } from '../services/api';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

export default function Contacts() {
    const [contactsList, setContactsList] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [tabValue, setTabValue] = useState(0);
    const [openDialog, setOpenDialog] = useState(false);
    const [openGroupDialog, setOpenGroupDialog] = useState(false);
    const [newContact, setNewContact] = useState({ email: '', full_name: '', company_name: '' });
    const [newGroup, setNewGroup] = useState({ name: '', description: '', contact_ids: [] });
    const [selectedFile, setSelectedFile] = useState(null);

    useEffect(() => {
        fetchContacts();
        fetchGroups();
    }, [page, rowsPerPage, search]);

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const response = await contacts.getAll({
                page: page + 1,
                limit: rowsPerPage,
                search,
            });
            setContactsList(response.data.data.contacts);
            setTotal(response.data.data.pagination.total);
        } catch (error) {
            console.error('Failed to fetch contacts:', error);
            toast.error('Failed to load contacts');
        } finally {
            setLoading(false);
        }
    };

    const fetchGroups = async () => {
        try {
            const response = await contacts.getGroups();
            setGroups(response.data.data.groups);
        } catch (error) {
            console.error('Failed to fetch groups:', error);
        }
    };

    const handleAddContact = async () => {
        if (!newContact.email) {
            toast.error('Email is required');
            return;
        }
        
        try {
            await contacts.add(newContact);
            toast.success('Contact added successfully');
            setOpenDialog(false);
            setNewContact({ email: '', full_name: '', company_name: '' });
            fetchContacts();
        } catch (error) {
            toast.error('Failed to add contact');
        }
    };

    const handleDeleteContact = async (id) => {
        if (window.confirm('Are you sure you want to delete this contact?')) {
            try {
                await contacts.delete(id);
                toast.success('Contact deleted successfully');
                fetchContacts();
            } catch (error) {
                toast.error('Failed to delete contact');
            }
        }
    };

    const handleImportFile = async () => {
        if (!selectedFile) {
            toast.error('Please select a file');
            return;
        }
        
        try {
            await contacts.import(selectedFile);
            toast.success('Contacts imported successfully');
            setSelectedFile(null);
            fetchContacts();
        } catch (error) {
            toast.error('Failed to import contacts');
        }
    };

    const handleCreateGroup = async () => {
        if (!newGroup.name) {
            toast.error('Group name is required');
            return;
        }
        
        try {
            await contacts.createGroup(newGroup);
            toast.success('Group created successfully');
            setOpenGroupDialog(false);
            setNewGroup({ name: '', description: '', contact_ids: [] });
            fetchGroups();
        } catch (error) {
            toast.error('Failed to create group');
        }
    };

    const handleExportCSV = () => {
        const exportData = contactsList.map(contact => ({
            Email: contact.email,
            'Full Name': contact.full_name,
            'Company Name': contact.company_name,
            'Country': contact.country,
            'Created At': contact.created_at,
        }));
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
        XLSX.writeFile(wb, `contacts_export_${Date.now()}.xlsx`);
        toast.success('Contacts exported successfully');
    };

    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                Contact Management
            </Typography>

            <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 3 }}>
                <Tab label="Contacts" />
                <Tab label="Groups" />
                <Tab label="Import/Export" />
            </Tabs>

            {tabValue === 0 && (
                <Paper sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <TextField
                            placeholder="Search contacts..."
                            size="small"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ width: 300 }}
                        />
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setOpenDialog(true)}
                        >
                            Add Contact
                        </Button>
                    </Box>

                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Email</TableCell>
                                    <TableCell>Full Name</TableCell>
                                    <TableCell>Company</TableCell>
                                    <TableCell>Created</TableCell>
                                    <TableCell>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading && (
                                    <TableRow>
                                        <TableCell colSpan={5}>
                                            <LinearProgress />
                                        </TableCell>
                                    </TableRow>
                                )}
                                {contactsList.map((contact) => (
                                    <TableRow key={contact.id}>
                                        <TableCell>{contact.email}</TableCell>
                                        <TableCell>{contact.full_name || '-'}</TableCell>
                                        <TableCell>{contact.company_name || '-'}</TableCell>
                                        <TableCell>
                                            {new Date(contact.created_at).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => handleDeleteContact(contact.id)}
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {contactsList.length === 0 && !loading && (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center">
                                            No contacts found
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <TablePagination
                        rowsPerPageOptions={[10, 25, 50]}
                        component="div"
                        count={total}
                        rowsPerPage={rowsPerPage}
                        page={page}
                        onPageChange={(e, newPage) => setPage(newPage)}
                        onRowsPerPageChange={(e) => {
                            setRowsPerPage(parseInt(e.target.value, 10));
                            setPage(0);
                        }}
                    />
                </Paper>
            )}

            {tabValue === 1 && (
                <Paper sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6">Contact Groups</Typography>
                        <Button
                            variant="contained"
                            startIcon={<GroupAddIcon />}
                            onClick={() => setOpenGroupDialog(true)}
                        >
                            Create Group
                        </Button>
                    </Box>
                    <List>
                        {groups.map((group) => (
                            <ListItem key={group.id} divider>
                                <ListItemText
                                    primary={group.name}
                                    secondary={`${group.contact_count || 0} contacts - ${group.description || 'No description'}`}
                                />
                                <ListItemSecondaryAction>
                                    <Chip label={`${group.contact_count || 0} members`} size="small" />
                                </ListItemSecondaryAction>
                            </ListItem>
                        ))}
                        {groups.length === 0 && (
                            <Typography color="textSecondary" align="center" sx={{ py: 4 }}>
                                No groups created yet
                            </Typography>
                        )}
                    </List>
                </Paper>
            )}

            {tabValue === 2 && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>Import Contacts</Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        Supported formats: CSV, JSON, Excel. File should contain email, full_name, company_name columns.
                    </Alert>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <Button
                            variant="outlined"
                            component="label"
                            startIcon={<UploadIcon />}
                        >
                            Choose File
                            <input
                                type="file"
                                hidden
                                accept=".csv,.json,.xlsx,.xls"
                                onChange={(e) => setSelectedFile(e.target.files[0])}
                            />
                        </Button>
                        {selectedFile && (
                            <>
                                <Typography variant="body2">{selectedFile.name}</Typography>
                                <Button variant="contained" onClick={handleImportFile}>
                                    Import
                                </Button>
                            </>
                        )}
                    </Box>

                    <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
                        Export Contacts
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={handleExportCSV}
                    >
                        Export to Excel
                    </Button>
                </Paper>
            )}

            {/* Add Contact Dialog */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add New Contact</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="Email Address"
                        value={newContact.email}
                        onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                        margin="normal"
                        required
                        type="email"
                    />
                    <TextField
                        fullWidth
                        label="Full Name"
                        value={newContact.full_name}
                        onChange={(e) => setNewContact({ ...newContact, full_name: e.target.value })}
                        margin="normal"
                    />
                    <TextField
                        fullWidth
                        label="Company Name"
                        value={newContact.company_name}
                        onChange={(e) => setNewContact({ ...newContact, company_name: e.target.value })}
                        margin="normal"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
                    <Button onClick={handleAddContact} variant="contained">Add</Button>
                </DialogActions>
            </Dialog>

            {/* Create Group Dialog */}
            <Dialog open={openGroupDialog} onClose={() => setOpenGroupDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create Contact Group</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="Group Name"
                        value={newGroup.name}
                        onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                        margin="normal"
                        required
                    />
                    <TextField
                        fullWidth
                        label="Description"
                        value={newGroup.description}
                        onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                        margin="normal"
                        multiline
                        rows={2}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenGroupDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreateGroup} variant="contained">Create</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}