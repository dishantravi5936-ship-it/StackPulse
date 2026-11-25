import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { LoadingBlock } from './components/ui';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const EndpointDetailPage = lazy(() => import('./pages/EndpointDetailPage'));
const EndpointsPage = lazy(() => import('./pages/EndpointsPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const IncidentsPage = lazy(() => import('./pages/IncidentsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const StatusPage = lazy(() => import('./pages/StatusPage'));

function ProtectedWorkspace() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AppShell /> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={<LoadingBlock />}>
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
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
