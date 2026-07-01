'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Phone, ChevronLeft, ChevronDown, List, Sparkles, Target, LogOut } from 'lucide-react';
import { logoutRequest } from '@shared/lib/auth-api.client';

export default function CallsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    // Check if user is manager based on cookies
    const match = document.cookie.match(/(?:^|;)\s*rbac_user_json=([^;]*)/);
    if (match) {
      try {
        const user = JSON.parse(decodeURIComponent(match[1]));
        setIsManager(
          user.role === 'MANAGER' || 
          user.role === 'sales_manager' || 
          user.role === 'SALES_MANAGER' || 
          user.frontendRole === 'sales_manager'
        );
        setUserName(user.name || '');
      } catch (e) {}
    }
  }, []);

  const handleSignOut = async () => {
    await logoutRequest();
    window.location.href = '/login';
  };

  const navItems = isManager
    ? [
        { label: 'Calls List', icon: <List size={18} />, href: '/calls/reviews/list' },
      ]
    : [
        { label: 'My Calls', icon: <List size={18} />, href: '/calls/ai-reviewer' },
      ];

  return (
    <div className="flex h-screen w-full bg-[#f4f6fb] overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-300 shrink-0 relative ${
          isCollapsed ? 'w-[64px]' : 'w-[240px]'
        }`}
      >
        <div className={`flex items-center h-14 border-b border-gray-100 ${isCollapsed ? 'justify-center' : 'px-4 justify-between'}`}>
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold border border-purple-200">
                Relanto
              </span>
            </div>
          )}
          {isCollapsed && (
            <button
              onClick={() => setIsCollapsed(false)}
              className="w-8 h-8 flex items-center justify-center bg-purple-100 text-purple-700 rounded text-xs font-bold hover:opacity-80"
            >
              R
            </button>
          )}
          {!isCollapsed && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 hover:bg-gray-100 rounded text-gray-500"
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>

        <nav className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto">
          <div className="mb-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {!isCollapsed && 'Conversations'}
          </div>
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-r-md" />
                )}
                <div className={`shrink-0 ${isActive ? 'text-blue-700' : 'text-gray-500'}`}>
                  {item.icon}
                </div>
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-100 bg-gray-50">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                {userName.charAt(0) || 'U'}
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Log out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {userName.charAt(0) || 'U'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    {userName || 'User'}
                  </span>
                  <span className="text-xs text-gray-500 truncate">
                    {isManager ? 'Sales Manager' : 'Sales Rep'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                title="Log out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-white">
        {children}
      </main>
    </div>
  );
}
