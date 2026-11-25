import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import DashboardPage from './pages/DashboardPage';
import EndpointDetailPage from './pages/EndpointDetailPage';
import EndpointsPage from './pages/EndpointsPage';
import HomePage from './pages/HomePage';
import IncidentsPage from './pages/IncidentsPage';
import LoginPage from './pages/LoginPage';
import NotificationsPage from './pages/NotificationsPage';
import StatusPage from './pages/StatusPage';

function ProtectedWorkspace() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AppShell /> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<LoginPage mode="register" />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/status/:slug" element={<StatusPage />} />
            <Route path="/dashboard" element={<ProtectedWorkspace />}>
              <Route index element={<DashboardPage />} />
              <Route path="endpoints" element={<EndpointsPage />} />
              <Route path="endpoints/:id" element={<EndpointDetailPage />} />
              <Route path="incidents" element={<IncidentsPage />} />
              <Route path="incidents/:id" element={<IncidentsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
