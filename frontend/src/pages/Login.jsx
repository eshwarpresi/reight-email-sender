import React, { useState } from 'react';
import {
    Container,
    Box,
    Paper,
    TextField,
    Button,
    Typography,
    Alert,
    Tabs,
    Tab,
    IconButton,
    InputAdornment,
    Checkbox,
    FormControlLabel,
    Link,
    Divider,
    Stack,
    Fade,
    CircularProgress,
    useTheme,
} from '@mui/material';
import {
    Visibility,
    VisibilityOff,
    Email as EmailIcon,
    Lock as LockIcon,
    Person as PersonIcon,
    Google as GoogleIcon,
    GitHub as GitHubIcon,
    ArrowForward as ArrowForwardIcon,
    CheckCircleOutline as CheckCircleOutlineIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const theme = useTheme();
    const [tabValue, setTabValue] = useState(0);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [forgotPassword, setForgotPassword] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetSent, setResetSent] = useState(false);
    const [loginData, setLoginData] = useState({
        email: '',
        password: '',
    });
    const [registerData, setRegisterData] = useState({
        email: '',
        password: '',
        confirm_password: '',
        full_name: '',
    });

    const { login, register } = useAuth();

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
        setError('');
        setSuccess('');
        setForgotPassword(false);
    };

    const handleLoginChange = (e) => {
        setLoginData({
            ...loginData,
            [e.target.name]: e.target.value,
        });
    };

    const handleRegisterChange = (e) => {
        setRegisterData({
            ...registerData,
            [e.target.name]: e.target.value,
        });
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        const result = await login(loginData.email, loginData.password);
        if (!result.success) {
            setError(result.message);
        }
        setLoading(false);
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        
        if (registerData.password !== registerData.confirm_password) {
            setError('Passwords do not match');
            return;
        }
        
        if (registerData.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        
        setLoading(true);
        setError('');
        
        const result = await register({
            email: registerData.email,
            password: registerData.password,
            full_name: registerData.full_name,
            confirm_password: registerData.confirm_password,
        });
        
        if (!result.success) {
            setError(result.message);
        }
        setLoading(false);
    };

    const handleForgotPassword = () => {
        if (!resetEmail) {
            setError('Please enter your email address');
            return;
        }
        setLoading(true);
        // Simulate password reset API call
        setTimeout(() => {
            setLoading(false);
            setResetSent(true);
            setSuccess('Password reset link sent to your email!');
            setError('');
        }, 1500);
    };

    const handleSocialLogin = (provider) => {
        toast.info(`${provider} login coming soon!`);
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: '-50%',
                    right: '-50%',
                    width: '200%',
                    height: '200%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)',
                    animation: 'rotate 60s linear infinite',
                },
                '@keyframes rotate': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                },
            }}
        >
            <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
                <Fade in timeout={500}>
                    <Paper 
                        elevation={24} 
                        sx={{ 
                            p: { xs: 3, sm: 4 }, 
                            borderRadius: 4,
                            background: 'rgba(255,255,255,0.95)',
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        }}
                    >
                        <Box sx={{ textAlign: 'center', mb: 4 }}>
                            <Box
                                sx={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    mx: 'auto',
                                    mb: 2,
                                    boxShadow: '0 8px 30px rgba(102, 126, 234, 0.4)',
                                }}
                            >
                                <EmailIcon sx={{ fontSize: 40, color: 'white' }} />
                            </Box>
                            <Typography 
                                variant="h4" 
                                component="h1" 
                                gutterBottom
                                sx={{
                                    fontWeight: 700,
                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                }}
                            >
                                Freight Email Sender
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                                Bulk Email Management System
                            </Typography>
                        </Box>

                        <Tabs 
                            value={tabValue} 
                            onChange={handleTabChange} 
                            sx={{ 
                                mb: 3,
                                '& .MuiTab-root': {
                                    fontWeight: 600,
                                    fontSize: '1rem',
                                },
                                '& .Mui-selected': {
                                    color: '#667eea !important',
                                },
                                '& .MuiTabs-indicator': {
                                    backgroundColor: '#667eea',
                                    height: 3,
                                    borderRadius: '3px 3px 0 0',
                                },
                            }}
                            centered
                        >
                            <Tab label="Login" />
                            <Tab label="Register" />
                        </Tabs>

                        {error && (
                            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                                {error}
                            </Alert>
                        )}

                        {success && (
                            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                                {success}
                            </Alert>
                        )}

                        {tabValue === 0 && (
                            <Box>
                                {!forgotPassword ? (
                                    <form onSubmit={handleLoginSubmit}>
                                        <TextField
                                            fullWidth
                                            label="Email Address"
                                            name="email"
                                            type="email"
                                            value={loginData.email}
                                            onChange={handleLoginChange}
                                            margin="normal"
                                            required
                                            variant="outlined"
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <EmailIcon color="action" />
                                                    </InputAdornment>
                                                ),
                                                sx: { borderRadius: 2 },
                                            }}
                                        />
                                        <TextField
                                            fullWidth
                                            label="Password"
                                            name="password"
                                            type={showPassword ? 'text' : 'password'}
                                            value={loginData.password}
                                            onChange={handleLoginChange}
                                            margin="normal"
                                            required
                                            variant="outlined"
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <LockIcon color="action" />
                                                    </InputAdornment>
                                                ),
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        <IconButton
                                                            onClick={() => setShowPassword(!showPassword)}
                                                            edge="end"
                                                            aria-label="toggle password visibility"
                                                        >
                                                            {showPassword ? <VisibilityOff /> : <Visibility />}
                                                        </IconButton>
                                                    </InputAdornment>
                                                ),
                                                sx: { borderRadius: 2 },
                                            }}
                                        />

                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        checked={rememberMe}
                                                        onChange={(e) => setRememberMe(e.target.checked)}
                                                        sx={{
                                                            color: '#667eea',
                                                            '&.Mui-checked': {
                                                                color: '#667eea',
                                                            },
                                                        }}
                                                    />
                                                }
                                                label="Remember me"
                                            />
                                            <Link
                                                href="#"
                                                variant="body2"
                                                onClick={() => setForgotPassword(true)}
                                                sx={{ 
                                                    color: '#667eea',
                                                    fontWeight: 500,
                                                    textDecoration: 'none',
                                                    '&:hover': {
                                                        textDecoration: 'underline',
                                                    },
                                                }}
                                            >
                                                Forgot password?
                                            </Link>
                                        </Box>

                                        <Button
                                            type="submit"
                                            fullWidth
                                            variant="contained"
                                            size="large"
                                            disabled={loading}
                                            sx={{ 
                                                mt: 3, 
                                                mb: 2, 
                                                py: 1.5,
                                                borderRadius: 2,
                                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                '&:hover': {
                                                    background: 'linear-gradient(135deg, #5a6fd6 0%, #6a3f92 100%)',
                                                    boxShadow: '0 8px 25px rgba(102, 126, 234, 0.4)',
                                                },
                                            }}
                                        >
                                            {loading ? <CircularProgress size={24} color="inherit" /> : 'Login'}
                                        </Button>

                                        <Divider sx={{ my: 2 }}>
                                            <Typography variant="caption" color="textSecondary">
                                                OR CONTINUE WITH
                                            </Typography>
                                        </Divider>

                                        <Stack direction="row" spacing={2}>
                                            <Button
                                                fullWidth
                                                variant="outlined"
                                                startIcon={<GoogleIcon />}
                                                onClick={() => handleSocialLogin('Google')}
                                                sx={{ 
                                                    borderRadius: 2,
                                                    borderColor: '#ddd',
                                                    '&:hover': {
                                                        borderColor: '#667eea',
                                                        backgroundColor: 'rgba(102, 126, 234, 0.05)',
                                                    },
                                                }}
                                            >
                                                Google
                                            </Button>
                                            <Button
                                                fullWidth
                                                variant="outlined"
                                                startIcon={<GitHubIcon />}
                                                onClick={() => handleSocialLogin('GitHub')}
                                                sx={{ 
                                                    borderRadius: 2,
                                                    borderColor: '#ddd',
                                                    '&:hover': {
                                                        borderColor: '#667eea',
                                                        backgroundColor: 'rgba(102, 126, 234, 0.05)',
                                                    },
                                                }}
                                            >
                                                GitHub
                                            </Button>
                                        </Stack>
                                    </form>
                                ) : (
                                    <Box>
                                        <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                                            Enter your email address and we'll send you a link to reset your password.
                                        </Alert>
                                        
                                        <TextField
                                            fullWidth
                                            label="Email Address"
                                            type="email"
                                            value={resetEmail}
                                            onChange={(e) => setResetEmail(e.target.value)}
                                            margin="normal"
                                            required
                                            variant="outlined"
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <EmailIcon color="action" />
                                                    </InputAdornment>
                                                ),
                                                sx: { borderRadius: 2 },
                                            }}
                                        />

                                        <Button
                                            fullWidth
                                            variant="contained"
                                            size="large"
                                            onClick={handleForgotPassword}
                                            disabled={loading}
                                            sx={{ 
                                                mt: 3, 
                                                mb: 2, 
                                                py: 1.5,
                                                borderRadius: 2,
                                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                '&:hover': {
                                                    background: 'linear-gradient(135deg, #5a6fd6 0%, #6a3f92 100%)',
                                                },
                                            }}
                                        >
                                            {loading ? <CircularProgress size={24} color="inherit" /> : 'Send Reset Link'}
                                        </Button>

                                        <Button
                                            fullWidth
                                            variant="text"
                                            onClick={() => {
                                                setForgotPassword(false);
                                                setResetSent(false);
                                                setError('');
                                                setSuccess('');
                                            }}
                                            sx={{ color: '#667eea' }}
                                        >
                                            ← Back to Login
                                        </Button>
                                    </Box>
                                )}
                            </Box>
                        )}

                        {tabValue === 1 && (
                            <form onSubmit={handleRegisterSubmit}>
                                <TextField
                                    fullWidth
                                    label="Full Name"
                                    name="full_name"
                                    value={registerData.full_name}
                                    onChange={handleRegisterChange}
                                    margin="normal"
                                    required
                                    variant="outlined"
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <PersonIcon color="action" />
                                            </InputAdornment>
                                        ),
                                        sx: { borderRadius: 2 },
                                    }}
                                />
                                <TextField
                                    fullWidth
                                    label="Email Address"
                                    name="email"
                                    type="email"
                                    value={registerData.email}
                                    onChange={handleRegisterChange}
                                    margin="normal"
                                    required
                                    variant="outlined"
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <EmailIcon color="action" />
                                            </InputAdornment>
                                        ),
                                        sx: { borderRadius: 2 },
                                    }}
                                />
                                <TextField
                                    fullWidth
                                    label="Password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={registerData.password}
                                    onChange={handleRegisterChange}
                                    margin="normal"
                                    required
                                    variant="outlined"
                                    helperText="Password must be at least 6 characters"
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <LockIcon color="action" />
                                            </InputAdornment>
                                        ),
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    edge="end"
                                                >
                                                    {showPassword ? <VisibilityOff /> : <Visibility />}
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                        sx: { borderRadius: 2 },
                                    }}
                                />
                                <TextField
                                    fullWidth
                                    label="Confirm Password"
                                    name="confirm_password"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={registerData.confirm_password}
                                    onChange={handleRegisterChange}
                                    margin="normal"
                                    required
                                    variant="outlined"
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <LockIcon color="action" />
                                            </InputAdornment>
                                        ),
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton
                                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                    edge="end"
                                                >
                                                    {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                        sx: { borderRadius: 2 },
                                    }}
                                />

                                <Button
                                    type="submit"
                                    fullWidth
                                    variant="contained"
                                    size="large"
                                    disabled={loading}
                                    sx={{ 
                                        mt: 3, 
                                        mb: 2, 
                                        py: 1.5,
                                        borderRadius: 2,
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        '&:hover': {
                                            background: 'linear-gradient(135deg, #5a6fd6 0%, #6a3f92 100%)',
                                            boxShadow: '0 8px 25px rgba(102, 126, 234, 0.4)',
                                        },
                                    }}
                                >
                                    {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Account'}
                                </Button>

                                <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 2 }}>
                                    By registering, you agree to our Terms of Service and Privacy Policy
                                </Typography>
                            </form>
                        )}
                    </Paper>
                </Fade>
            </Container>
        </Box>
    );
}