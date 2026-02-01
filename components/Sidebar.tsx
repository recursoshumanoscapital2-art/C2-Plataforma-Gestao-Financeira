
import React from 'react';
import { NavLink } from 'react-router-dom';
import { UserInfo } from '../App';

interface SidebarProps {
  currentUser: UserInfo | null;
  onLogout: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentUser, onLogout, isCollapsed, onToggle }) => {
  const menuItems = [
    { id: 'dashboard', path: '/', label: 'Dashboard', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    )},
    { id: 'import', path: '/import', label: 'Importação de Extratos', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    )},
    { id: 'companies', path: '/companies', label: 'Empresas Cadastradas', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )},
    { id: 'users', path: '/users', label: 'Usuários', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    )},
  ];

  const initials = (currentUser?.name || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '??';

  return (
    <aside className={`${isCollapsed ? 'w-24' : 'w-72'} bg-white border-r border-slate-100 flex flex-col h-screen sticky top-0 z-40 print-hidden transition-all duration-300 ease-in-out relative group`}>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 bg-white border border-slate-200 rounded-full p-1.5 shadow-md text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all z-50 focus:outline-none opacity-0 group-hover:opacity-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className={`p-8 transition-all duration-300 ${isCollapsed ? 'px-4' : 'px-8'}`}>
        <div className="flex flex-col items-center gap-4 overflow-hidden">
          <img 
            src="https://media.licdn.com/dms/image/v2/D4D0BAQH41gxV57DnqA/company-logo_200_200/company-logo_200_200/0/1680527601049/capitaldois_logo?e=2147483647&v=beta&t=9uEFrm2sEUXOAXyDnUi1S9-8fNdK03YNshAFKdKr2hA" 
            alt="C2 Logo" 
            className={`transition-all duration-300 object-contain ${isCollapsed ? 'h-12 w-12 rounded-lg' : 'h-48 w-48 rounded-xl'}`}
          />
          {!isCollapsed && (
            <div className="animate-in fade-in duration-300">
              <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight text-center">C2 Gestao Financeira</h1>
            </div>
          )}
        </div>
      </div>

      <nav className={`flex-1 space-y-2 py-4 transition-all duration-300 ${isCollapsed ? 'px-3' : 'px-4'}`}>
        {menuItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }: { isActive: boolean }) => `w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3.5 rounded-2xl text-sm font-bold transition-all ${
              isActive
                ? 'bg-indigo-50 text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title={isCollapsed ? item.label : ''}
          >
            {({ isActive }: { isActive: boolean }) => (
              <>
                <span className={`transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {item.icon}
                </span>
                {!isCollapsed && <span className="animate-in slide-in-from-left-2 duration-200">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className={`p-6 border-t border-slate-50 transition-all duration-300 ${isCollapsed ? 'px-3' : 'px-6'}`}>
        <div className={`flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-10 h-10 min-w-[40px] rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs shadow-sm">
            {initials}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0 animate-in fade-in duration-200">
              <p className="text-xs font-black text-slate-900 truncate">{currentUser?.name || 'Usuário'}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase truncate capitalize">{currentUser?.role || 'Nível'}</p>
            </div>
          )}
        </div>
        <button
          onClick={onLogout}
          className={`w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-100`}
          title={isCollapsed ? 'Sair do Sistema' : ''}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!isCollapsed && <span className="animate-in fade-in duration-200">Logoff</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
