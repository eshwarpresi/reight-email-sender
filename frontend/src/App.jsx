import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import EmailComposer from './pages/EmailComposer';
import Contacts from './pages/Contacts';
import EmailHistory from './pages/EmailHistory';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import SimpleEmail from './pages/SimpleEmail';
import PersonalizedEmail from './pages/PersonalizedEmail';

// Protected route component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/bulk-email" replace />} />
        <Route path="bulk-email" element={<SimpleEmail />} />
        <Route path="personalized" element={<PersonalizedEmail />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="compose" element={<EmailComposer />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="history" element={<EmailHistory />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;