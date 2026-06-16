import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const token = localStorage.getItem('token');
        if (token) {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            try {
                const response = await api.get('/auth/profile');
                setUser(response.data.data.user);
            } catch (error) {
                console.error('Auth check failed:', error);
                localStorage.removeItem('token');
                delete api.defaults.headers.common['Authorization'];
            }
        }
        setLoading(false);
    };

    const login = async (email, password) => {
        try {
            const response = await api.post('/auth/login', { email, password });
            const { token, user } = response.data.data;
            
            localStorage.setItem('token', token);
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            setUser(user);
            
            toast.success('Login successful!');
            navigate('/dashboard');
            return { success: true };
        } catch (error) {
            const message = error.response?.data?.message || 'Login failed';
            toast.error(message);
            return { success: false, message };
        }
    };

    // Google Login - Redirects to Google OAuth
    const loginWithGoogle = async () => {
        try {
            // Redirect to backend Google OAuth endpoint
            window.location.href = `${api.defaults.baseURL}/auth/google`;
        } catch (error) {
            toast.error('Google login failed. Please try again.');
            return { success: false, message: 'Google login failed' };
        }
    };

    // GitHub Login - Redirects to GitHub OAuth
    const loginWithGitHub = async () => {
        try {
            // Redirect to backend GitHub OAuth endpoint
            window.location.href = `${api.defaults.baseURL}/auth/github`;
        } catch (error) {
            toast.error('GitHub login failed. Please try again.');
            return { success: false, message: 'GitHub login failed' };
        }
    };

    // Handle OAuth callback (after Google/GitHub redirects back)
    const handleOAuthCallback = async (urlParams) => {
        try {
            const token = new URLSearchParams(urlParams).get('token');
            if (token) {
                localStorage.setItem('token', token);
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                
                const response = await api.get('/auth/profile');
                setUser(response.data.data.user);
                
                toast.success('Login successful!');
                navigate('/dashboard');
                return { success: true };
            }
            return { success: false };
        } catch (error) {
            console.error('OAuth callback error:', error);
            toast.error('OAuth login failed');
            return { success: false };
        }
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('token');
            delete api.defaults.headers.common['Authorization'];
            setUser(null);
            navigate('/login');
            toast.info('Logged out successfully');
        }
    };

    const register = async (userData) => {
        try {
            const response = await api.post('/auth/register', userData);
            const { token, user } = response.data.data;
            
            localStorage.setItem('token', token);
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            setUser(user);
            
            toast.success('Registration successful!');
            navigate('/dashboard');
            return { success: true };
        } catch (error) {
            const message = error.response?.data?.message || 'Registration failed';
            toast.error(message);
            return { success: false, message };
        }
    };

    const changePassword = async (currentPassword, newPassword) => {
        try {
            await api.put('/auth/change-password', {
                current_password: currentPassword,
                new_password: newPassword
            });
            toast.success('Password changed successfully');
            return { success: true };
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to change password';
            toast.error(message);
            return { success: false, message };
        }
    };

    const value = {
        user,
        loading,
        login,
        loginWithGoogle,
        loginWithGitHub,
        handleOAuthCallback,
        logout,
        register,
        changePassword,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};