import React, { useState, useEffect } from 'react';
import {
    Grid,
    Card,
    CardContent,
    Typography,
    Box,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    LinearProgress,
} from '@mui/material';
import {
    Email as EmailIcon,
    Send as SendIcon,
    Error as ErrorIcon,
    Campaign as CampaignIcon,
    TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { campaigns } from '../services/api';
import { format } from 'date-fns';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [recentCampaigns, setRecentCampaigns] = useState([]);
    const [hourlyActivity, setHourlyActivity] = useState([]);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const response = await campaigns.getDashboardStats();
            const { overview, recent_campaigns, hourly_activity } = response.data.data;
            setStats(overview);
            setRecentCampaigns(recent_campaigns);
            setHourlyActivity(hourly_activity);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const StatCard = ({ title, value, icon, color, subtitle }) => (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Typography color="textSecondary" gutterBottom variant="body2">
                            {title}
                        </Typography>
                        <Typography variant="h4" component="div">
                            {value || 0}
                        </Typography>
                        {subtitle && (
                            <Typography variant="caption" color="textSecondary">
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                    <Box
                        sx={{
                            backgroundColor: `${color}20`,
                            borderRadius: '50%',
                            p: 1,
                            display: 'flex',
                        }}
                    >
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
                <CircularProgress />
            </Box>
        );
    }

    const pieData = [
                        { name: 'Sent', value: stats?.total_sent || 0 },
                        { name: 'Failed', value: stats?.total_failed || 0 },
                    ];

    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                Dashboard
            </Typography>
            <Typography variant="body1" color="textSecondary" paragraph>
                Welcome back! Here's what's happening with your email campaigns.
            </Typography>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Total Campaigns"
                        value={stats?.total_campaigns}
                        icon={<CampaignIcon sx={{ fontSize: 40, color: '#1976d2' }} />}
                        color="#1976d2"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Total Recipients"
                        value={stats?.total_recipients}
                        icon={<EmailIcon sx={{ fontSize: 40, color: '#4caf50' }} />}
                        color="#4caf50"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Emails Sent"
                        value={stats?.total_sent}
                        icon={<SendIcon sx={{ fontSize: 40, color: '#ff9800' }} />}
                        color="#ff9800"
                        subtitle={`Success Rate: ${stats?.success_rate || 0}%`}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Failed Emails"
                        value={stats?.total_failed}
                        icon={<ErrorIcon sx={{ fontSize: 40, color: '#f44336' }} />}
                        color="#f44336"
                    />
                </Grid>
            </Grid>

            <Grid container spacing={3}>
                <Grid item xs={12} md={8}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Email Activity (Last 24 Hours)
                            </Typography>
                            <Box sx={{ height: 300 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={hourlyActivity}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="hour" />
                                        <YAxis />
                                        <Tooltip />
                                        <Area
                                            type="monotone"
                                            dataKey="count"
                                            stroke="#1976d2"
                                            fill="#1976d220"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Delivery Status
                            </Typography>
                            <Box sx={{ height: 250 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={(entry) => `${entry.name}: ${entry.value}`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </Box>
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="body2" color="textSecondary">
                                    Today's Campaigns: {stats?.today_campaigns || 0}
                                </Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Recent Campaigns
                            </Typography>
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Campaign Name</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Recipients</TableCell>
                                            <TableCell>Sent</TableCell>
                                            <TableCell>Failed</TableCell>
                                            <TableCell>Created</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {recentCampaigns.map((campaign) => (
                                            <TableRow key={campaign.id}>
                                                <TableCell>{campaign.name}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={campaign.status}
                                                        size="small"
                                                        color={
                                                            campaign.status === 'completed'
                                                                ? 'success'
                                                                : campaign.status === 'failed'
                                                                ? 'error'
                                                                : 'warning'
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell>{campaign.total_recipients}</TableCell>
                                                <TableCell>{campaign.sent_count || 0}</TableCell>
                                                <TableCell>{campaign.failed_count || 0}</TableCell>
                                                <TableCell>
                                                    {format(new Date(campaign.created_at), 'MMM dd, yyyy')}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {recentCampaigns.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} align="center">
                                                    No campaigns found
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}