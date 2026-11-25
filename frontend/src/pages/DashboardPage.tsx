import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem('stackpulse_token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  if (!token) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-gray-900">StackPulse Dashboard</span>
        <button
          onClick={() => {
            localStorage.removeItem('stackpulse_token');
            navigate('/login');
          }}
          className="text-sm text-gray-500 hover:text-red-500"
        >
          Sign out
        </button>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>
        <p className="text-gray-500 text-sm">
          Admin dashboard — endpoint management and incident tracking coming in Phase 3.
        </p>
      </main>
    </div>
  );
}

