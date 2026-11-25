import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import StatusPage from './pages/StatusPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/status" replace />} />
          <Route path="/status" element={<StatusPage />} />
        </Route>

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* Admin (protected — auth check inside DashboardPage) */}
        <Route path="/dashboard/*" element={<DashboardPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/status" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
