import React from 'react';
import { NavLink } from 'react-router-dom';
import { UserInfo } from '../App';

interface SidebarProps {
  currentUser: UserInfo | null;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentUser, onLogout }) => {
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
    <aside className="w-72 bg-white border-r border-slate-100 flex flex-col h-screen sticky top-0 z-40 print-hidden">
      <div className="p-8">
        <div className="flex flex-col items-center gap-4">
          <img 
            src="https://media.licdn.com/dms/image/v2/D4D0BAQH41gxV57DnqA/company-logo_200_200/company-logo_200_200/0/1680527601049/capitaldois_logo?e=2147483647&v=beta&t=9uEFrm2sEUXOAXyDnUi1S9-8fNdK03YNshAFKdKr2hA" 
            alt="C2 Logo" 
            className="h-56 w-56 rounded-xl object-contain"
          />
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight text-center">C2 Gestao Financeira</h1>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }: { isActive: boolean }) => `w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              isActive
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {({ isActive }: { isActive: boolean }) => (
              <>
                <span className={`${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {item.icon}
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-6 border-t border-slate-50">
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-slate-900 truncate">{currentUser?.name || 'Usuário'}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase truncate capitalize">{currentUser?.role || 'Nível'}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Logoff</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
