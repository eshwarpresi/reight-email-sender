import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CircularProgress, Typography, Box } from '@mui/material';

export default function OAuthCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { handleOAuthCallback } = useAuth();
    const [error, setError] = useState('');

    useEffect(() => {
        const token = searchParams.get('token');
        const errorParam = searchParams.get('error');

        if (errorParam) {
            setError('Login failed. Please try again.');
            setTimeout(() => navigate('/login'), 3000);
            return;
        }

        if (token) {
            handleOAuthCallback(window.location.search)
                .then(result => {
                    if (!result.success) {
                        setError('Login failed');
                        setTimeout(() => navigate('/login'), 2000);
                    }
                });
        } else {
            setError('No token received');
            setTimeout(() => navigate('/login'), 2000);
        }
    }, []);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
            {error ? (
                <Typography color="error" variant="h6">{error}</Typography>
            ) : (
                <>
                    <CircularProgress size={60} />
                    <Typography variant="h6" sx={{ mt: 2 }}>Completing login...</Typography>
                </>
            )}
        </Box>
    );
}