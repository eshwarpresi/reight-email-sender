import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Grid,
    Card,
    CardContent,
    Button,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    Chip,
    Alert,
    IconButton,
} from '@mui/material';
import {
    Download as DownloadIcon,
    TrendingUp as TrendingUpIcon,
    Email as EmailIcon,
    Error as ErrorIcon,
    CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { reports } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function Reports() {
    const [loading, setLoading] = useState(false);
    const [emailReports, setEmailReports] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [filters, setFilters] = useState({
        start_date: '',
        end_date: '',
        status: '',
    });

    useEffect(() => {
        fetchEmailReports();
        fetchAnalytics();
    }, [page, rowsPerPage, filters]);

    const fetchEmailReports = async () => {
        setLoading(true);
        try {
            const response = await reports.getEmails({
                page: page + 1,
                limit: rowsPerPage,
                ...filters,
            });
            setEmailReports(response.data.data.emails);
            setTotal(response.data.data.pagination.total);
        } catch (error) {
            console.error('Failed to fetch email reports:', error);
            toast.error('Failed to load reports');
        } finally {
            setLoading(false);
        }
    };

    const fetchAnalytics = async () => {
        try {
            const response = await reports.getAnalytics();
            setAnalytics(response.data.data);
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        }
    };

    const handleExportFullReport = async () => {
        try {
            const response = await reports.exportFull({
                start_date: filters.start_date,
                end_date: filters.end_date,
                format: 'excel',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `full_report_${Date.now()}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('Full report downloaded successfully');
        } catch (error) {
            toast.error('Failed to export full report');
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'sent':
                return <CheckCircleIcon color="success" fontSize="small" />;
            case 'failed':
                return <ErrorIcon color="error" fontSize="small" />;
            default:
                return <EmailIcon color="warning" fontSize="small" />;
        }
    };

    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                Reports & Analytics
            </Typography>

            {/* Analytics Cards */}
            {analytics && (
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={4}>
                        <Card>
                            <CardContent>
                                <Box display="flex" alignItems="center" justifyContent="space-between">
                                    <Box>
                                        <Typography color="textSecondary" gutterBottom>
                                            Total Campaigns (30 days)
                                        </Typography>
                                        <Typography variant="h4">
                                            {analytics.campaigns_over_time?.reduce((sum, item) => sum + item.total_campaigns, 0) || 0}
                                        </Typography>
                                    </Box>
                                    <TrendingUpIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Card>
                            <CardContent>
                                <Typography color="textSecondary" gutterBottom>
                                    Average Success Rate
                                </Typography>
                                <Typography variant="h4">
                                    {analytics.top_campaigns?.length > 0
                                        ? (analytics.top_campaigns.reduce((sum, c) => sum + c.success_rate, 0) / analytics.top_campaigns.length).toFixed(1)
                                        : 0}%
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Card>
                            <CardContent>
                                <Typography color="textSecondary" gutterBottom>
                                    Common Failures
                                </Typography>
                                <Typography variant="h6" fontSize="1rem">
                                    {analytics.failure_reasons?.[0]?.error_message?.substring(0, 30) || 'None'}
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                    {analytics.failure_reasons?.[0]?.count || 0} occurrences
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* Campaign Performance Chart */}
            {analytics?.campaigns_over_time && analytics.campaigns_over_time.length > 0 && (
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" gutterBottom>
                        Campaign Performance (Last 30 Days)
                    </Typography>
                    <Box sx={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={analytics.campaigns_over_time}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="total_campaigns" stroke="#1976d2" name="Campaigns" />
                                <Line type="monotone" dataKey="total_sent" stroke="#4caf50" name="Sent" />
                                <Line type="monotone" dataKey="total_failed" stroke="#f44336" name="Failed" />
                            </LineChart>
                        </ResponsiveContainer>
                    </Box>
                </Paper>
            )}

            {/* Top Campaigns */}
            {analytics?.top_campaigns && analytics.top_campaigns.length > 0 && (
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" gutterBottom>
                        Top Performing Campaigns
                    </Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Campaign Name</TableCell>
                                    <TableCell align="right">Recipients</TableCell>
                                    <TableCell align="right">Sent</TableCell>
                                    <TableCell align="right">Success Rate</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {analytics.top_campaigns.map((campaign, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>{campaign.name}</TableCell>
                                        <TableCell align="right">{campaign.total_recipients}</TableCell>
                                        <TableCell align="right">{campaign.sent_count}</TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={`${campaign.success_rate.toFixed(1)}%`}
                                                size="small"
                                                color={campaign.success_rate > 80 ? 'success' : 'warning'}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* Email Reports Table */}
            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                    Detailed Email Logs
                </Typography>
                
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} md={3}>
                        <TextField
                            fullWidth
                            label="Start Date"
                            type="date"
                            value={filters.start_date}
                            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <TextField
                            fullWidth
                            label="End Date"
                            type="date"
                            value={filters.end_date}
                            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <FormControl fullWidth>
                            <InputLabel>Status</InputLabel>
                            <Select
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                label="Status"
                            >
                                <MenuItem value="">All</MenuItem>
                                <MenuItem value="sent">Sent</MenuItem>
                                <MenuItem value="failed">Failed</MenuItem>
                                <MenuItem value="pending">Pending</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <Button
                            fullWidth
                            variant="contained"
                            startIcon={<DownloadIcon />}
                            onClick={handleExportFullReport}
                            sx={{ height: '100%' }}
                        >
                            Export Full Report
                        </Button>
                    </Grid>
                </Grid>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Campaign</TableCell>
                                <TableCell>Recipient</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Created</TableCell>
                                <TableCell>Sent At</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {emailReports.map((email) => (
                                <TableRow key={email.id}>
                                    <TableCell>{email.campaign_name}</TableCell>
                                    <TableCell>{email.recipient_email}</TableCell>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            {getStatusIcon(email.status)}
                                            <Chip
                                                label={email.status}
                                                size="small"
                                                color={email.status === 'sent' ? 'success' : 'error'}
                                            />
                                        </Box>
                                    </TableCell>
                                    <TableCell>{format(new Date(email.created_at), 'MMM dd, HH:mm')}</TableCell>
                                    <TableCell>
                                        {email.sent_at ? format(new Date(email.sent_at), 'MMM dd, HH:mm') : '-'}
                                    </TableCell>
                                </TableRow>
                            ))}
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
        </Box>
    );
}