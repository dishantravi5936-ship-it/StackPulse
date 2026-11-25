import { Outlet } from 'react-router-dom';
import { Activity } from 'lucide-react';

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Activity className="text-blue-600 w-5 h-5" />
          <span className="font-semibold text-gray-900 dark:text-gray-100">StackPulse</span>
          <span className="text-xs text-gray-400 ml-auto">
            Powered by{' '}
            <a
              href="https://github.com/TwiN/gatus"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-500"
            >
              Gatus
            </a>{' '}
            (Apache 2.0)
          </span>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
      <footer className="text-center py-6 text-xs text-gray-400">
        StackPulse — AVISHKAR'26
      </footer>
    </div>
  );
}
