import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Transaction, TransactionType } from './types';
import { processStatement } from './services/geminiService';
import Dashboard from './components/Dashboard';
import TransactionTable from './components/TransactionTable';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc
} from "firebase/firestore";

export interface ColumnFilters {
  date: string;
  ownerName: string;
  payingBank: string;
  type: string;
  origin: string;
  counterpartyName: string;
  amount: string;
  notes: string;
}

interface CompanyInfo {
  id?: string;
  name: string;
  originalName?: string;
  cnpj: string;
  alternativeNames?: string[];
  hidden?: boolean; 
}

export interface UserInfo {
  id?: string;
  userId?: string; 
  login: string;
  email: string;
  password?: string;
  role: 'admin' | 'comum';
  active: boolean;
}

const PrintLayout = ({ reportData, companyInfo, logoUrl, dateRange }: { reportData: { title: string; data: Transaction[]; type: 'inflow' | 'outflow' | 'all' }, companyInfo: any, logoUrl: string | null, dateRange: { start: string, end: string } }) => {
  const summary = useMemo(() => {
    return reportData.data.reduce((acc, t) => {
      if (t.type === TransactionType.INFLOW) acc.totalInflow += t.amount;
      else acc.totalOutflow += t.amount;
      return acc;
    }, { totalInflow: 0, totalOutflow: 0 });
  }, [reportData.data]);

  const balance = summary.totalInflow - summary.totalOutflow;

  return (
    <div id="report-print-area">
      <header className="report-header">
        <div className="flex items-center gap-4">
          {logoUrl && <img src={logoUrl} alt="Logo da Empresa" />}
          <div>
            <h1 className="text-xl font-bold">{companyInfo.name}</h1>
            <p className="text-xs text-slate-500">{companyInfo.cnpj}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold">{reportData.title}</h2>
          <p className="text-xs text-slate-500">
            Período: {dateRange.start ? new Date(dateRange.start + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início'} a {dateRange.end ? new Date(dateRange.end + 'T00:00:00').toLocaleDateString('pt-BR') : 'Fim'}
          </p>
        </div>
      </header>
      
      <main>
        <section className="report-summary">
          {(reportData.type === 'inflow' || reportData.type === 'all') && (
            <div className="summary-card" style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
              <p>Total de Entradas</p>
              <h3 style={{ color: '#166534' }}>R$ {summary.totalInflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            </div>
          )}
          {(reportData.type === 'outflow' || reportData.type === 'all') && (
            <div className="summary-card" style={{ backgroundColor: '#fff1f2', borderColor: '#fecdd3' }}>
              <p>Total de Saídas</p>
              <h3 style={{ color: '#9f1239' }}>R$ {summary.totalOutflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            </div>
          )}
          {reportData.type === 'all' && (
            <div className="summary-card" style={{ backgroundColor: balance >= 0 ? '#f0f9ff' : '#fff1f2', borderColor: balance >= 0 ? '#bae6fd' : '#fecdd3' }}>
              <p>Saldo Líquido</p>
              <h3 style={{ color: balance >= 0 ? '#0369a1' : '#9f1239' }}>R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            </div>
          )}
        </section>

        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Empresa</th>
              <th>Descrição</th>
              <th>Origem</th>
              <th style={{ textAlign: 'right' }}>Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            {reportData.data.map(t => (
              <tr key={t.id}>
                <td>{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                <td>{t.ownerName}</td>
                <td>{t.type === TransactionType.OUTFLOW ? t.counterpartyName : t.description}</td>
                <td>{t.origin}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: t.type === TransactionType.INFLOW ? '#15803d' : '#be123c' }}>
                  {t.type === TransactionType.OUTFLOW ? '-' : ''}{t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>

      <footer className="report-footer">
        Relatório gerado por C2 Gestao Financeira em {new Date().toLocaleString('pt-BR')}
      </footer>
    </div>
  );
};


const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null);
  
  const [registeredCompanies, setRegisteredCompanies] = useState<CompanyInfo[]>([]);
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCnpj, setNewCompanyCnpj] = useState('');
  const [newCompanyAltNames, setNewCompanyAltNames] = useState('');
  
  const [editingCnpj, setEditingCnpj] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editCnpjValue, setEditCnpjValue] = useState('');
  const [editAltNameValue, setEditAltNameValue] = useState('');

  const [usersList, setUsersList] = useState<UserInfo[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserLogin, setNewUserLogin] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'comum'>('comum');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordVisibility, setPasswordVisibility] = useState<{ [key: string]: boolean }>({});

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [logoUrl, setLogoUrl] = useState<string | null>('https://media.licdn.com/dms/image/v2/D4D0BAQH41gxV57DnqA/company-logo_200_200/company-logo_200_200/0/1680527601049/capitaldois_logo?e=2147483647&v=beta&t=9uEFrm2sEUXOAXyDnUi1S9-8fNdK03YNshAFKdKr2hA');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState('dashboard');
  
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    date: '', ownerName: '', payingBank: '', type: '', origin: '', counterpartyName: '', amount: '', notes: ''
  });

  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [reportDataForPrint, setReportDataForPrint] = useState<{ title: string; data: Transaction[]; type: 'inflow' | 'outflow' | 'all' } | null>(null);

  const uniqueCompanies = useMemo(() => {
    return registeredCompanies.filter(c => !c.hidden);
  }, [registeredCompanies]);

  useEffect(() => {
    if (reportDataForPrint) {
      const timer = setTimeout(() => {
        window.print();
        setReportDataForPrint(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [reportDataForPrint]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [transSnapshot, compSnapshot, usersSnapshot] = await Promise.all([
          getDocs(collection(db, "transactions")),
          getDocs(collection(db, "companies")),
          getDocs(collection(db, "users"))
        ]);
        const transList = transSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Transaction[];
        setTransactions(transList);
        const compList = compSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as CompanyInfo[];
        setRegisteredCompanies(compList);
        const usersListData = usersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as UserInfo[];
        setUsersList(usersListData);
        setIsDataLoaded(true); 
      } catch (err) {
        console.error("Erro ao carregar dados do Firebase:", err);
      } finally {
        setIsLoading(false);
      }
    };
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated]);

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];
    if (selectedCnpj) result = result.filter(t => t.ownerCnpj === selectedCnpj);
    result = result.filter(t => {
      if (!t.date) return true; 
      const tDatePart = t.date.split('T')[0];
      if (startDate && tDatePart < startDate) return false;
      if (endDate && tDatePart > endDate) return false;
      return true;
    });
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(t => Object.values(t).some(val => String(val).toLowerCase().includes(term)));
    }
    Object.keys(columnFilters).forEach((key) => {
      const filterValue = columnFilters[key as keyof ColumnFilters];
      if (filterValue) {
        const value = filterValue.toLowerCase();
        result = result.filter(t => {
          if (key === 'amount') {
            const formatted = (t.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            const displayVal = (t.type === TransactionType.OUTFLOW ? '-' : '') + formatted;
            return displayVal.includes(filterValue);
          }
          if (key === 'date') return t.date ? t.date.split('T')[0].includes(value) : false;
          const tValue = String(t[key as keyof Transaction] || '').toLowerCase();
          return tValue.includes(value);
        });
      }
    });
    return result.sort((a, b) => (a.date && b.date) ? new Date(b.date).getTime() - new Date(a.date).getTime() : 0);
  }, [transactions, selectedCnpj, startDate, endDate, searchTerm, columnFilters]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsLoading(true);
    setError(null);
    const fileList = Array.from(files) as File[];
    
    try {
      for (const file of fileList) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result?.toString().split(',')[1] || "");
          reader.onerror = (e) => reject(new Error("Erro ao ler arquivo"));
          reader.readAsDataURL(file);
        });
        const result = await processStatement(base64, file.type);
        const addedTransactions: Transaction[] = [];
        for (const t of result.transactions) {
          const docRef = await addDoc(collection(db, "transactions"), t);
          addedTransactions.push({ ...t, id: docRef.id });
        }
        setTransactions(prev => [...addedTransactions, ...prev]);
      }
      setCurrentView('dashboard');
    } catch (err: any) { 
      setError(err.message); 
      console.error("Erro no processamento:", err);
      alert(`Erro no processamento: ${err.message}`);
    } finally { 
      setIsLoading(false); 
      if (event.target) event.target.value = ''; 
    }
  }, []);

  const handleUpdateTransaction = useCallback(async (id: string, updates: Partial<Transaction>) => {
    try {
      await updateDoc(doc(db, "transactions", id), updates);
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    } catch (err) { console.error(err); }
  }, []);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const newCompany: CompanyInfo = { 
      name: newCompanyName.trim(), 
      cnpj: newCompanyCnpj.trim() || '', 
      alternativeNames: newCompanyAltNames ? newCompanyAltNames.split(',').map(n => n.trim()).filter(Boolean) : [],
      hidden: false
    };
    const docRef = await addDoc(collection(db, "companies"), newCompany);
    setRegisteredCompanies(prev => [...prev, { ...newCompany, id: docRef.id }]);
    setNewCompanyName(''); setNewCompanyCnpj(''); setNewCompanyAltNames(''); setIsAddingCompany(false);
  };

  const startEditCompany = (company: CompanyInfo) => {
    setEditingCnpj(company.cnpj || company.name); 
    setEditNameValue(company.name);
    setEditCnpjValue(company.cnpj);
    setEditAltNameValue(company.alternativeNames?.join(', ') || '');
  };

  const saveCompanyEdit = async (identifier: string) => {
    const company = registeredCompanies.find(c => c.cnpj === identifier || c.name === identifier);
    if (!company?.id) return;
    const updates = { 
      name: editNameValue.trim(), 
      cnpj: editCnpjValue.trim(), 
      alternativeNames: editAltNameValue ? editAltNameValue.split(',').map(n => n.trim()).filter(Boolean) : [] 
    };
    await updateDoc(doc(db, "companies", company.id), updates);
    setRegisteredCompanies(prev => prev.map(c => c.id === company.id ? { ...c, ...updates } : c));
    setEditingCnpj(null);
  };
  
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const newUser: UserInfo = {
      login: newUserLogin, email: newUserEmail, password: newUserPassword, role: newUserRole, active: true
    };
    const docRef = await addDoc(collection(db, "users"), newUser);
    setUsersList(prev => [...prev, { ...newUser, id: docRef.id }]);
    setNewUserLogin(''); setNewUserEmail(''); setNewUserPassword(''); setNewUserRole('comum');
    setIsAddingUser(false); setShowPassword(false);
  };

  const handleToggleUserStatus = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, "users", id), { active: !currentStatus });
    setUsersList(prev => prev.map(u => u.id === id ? { ...u, active: !currentStatus } : u));
  };

  const togglePasswordVisibility = (id: string) => {
    setPasswordVisibility(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGeneratePdf = (type: 'inflow' | 'outflow' | 'all') => {
    let data = filteredTransactions;
    let title = "Relatório Geral de Transações";
    if (type === 'inflow') {
      data = filteredTransactions.filter(t => t.type === TransactionType.INFLOW);
      title = "Relatório de Entradas";
    } else if (type === 'outflow') {
      data = filteredTransactions.filter(t => t.type === TransactionType.OUTFLOW);
      title = "Relatório de Saídas";
    }
    setReportDataForPrint({ title, data, type });
  };

  const renderContent = () => {
    if (currentView === 'dashboard') {
      return (
        <>
          {transactions.length > 0 || isDataLoaded ? (
            <>
              <div className="flex flex-col lg:flex-row justify-between items-start gap-6 mb-8">
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-black text-slate-900">Gestor Financeiro</h2>
                  <p className="text-sm text-slate-500 font-medium">Análise via Inteligência Artificial</p>
                </div>
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 w-full lg:w-auto">
                  <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-[10px] font-black bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 outline-none" />
                    <span className="text-[10px] text-slate-400 font-black">até</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-[10px] font-black bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 outline-none" />
                  </div>
                  <select className="bg-white p-2 rounded-xl text-[10px] font-black border border-slate-100" value={selectedCnpj || ""} onChange={(e) => setSelectedCnpj(e.target.value || null)}>
                    <option value="">Grupo Capital Dois</option>
                    {uniqueCompanies.map(c => <option key={c.cnpj || c.id} value={c.cnpj}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-10">
                <Dashboard transactions={filteredTransactions} selectedCnpj={selectedCnpj} />
                <TransactionTable transactions={filteredTransactions} allTransactions={transactions} onUpdateTransaction={handleUpdateTransaction} selectedCnpj={selectedCnpj} columnFilters={columnFilters} onColumnFilterChange={(f, v) => setColumnFilters(p => ({ ...p, [f]: v }))} />
              </div>
            </>
          ) : (
            <div className="text-center py-32 bg-white rounded-[3rem] border border-slate-100">
              <h2 className="text-3xl font-black mb-10 text-slate-900">Bem-vindo ao C2 Gestao Financeira</h2>
              <button onClick={() => setCurrentView('import')} className="bg-indigo-600 text-white font-black px-10 py-4 rounded-2xl text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Importar Extratos</button>
            </div>
          )}
        </>
      );
    }
    if (currentView === 'import') {
      return (
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-black mb-8">Importação de Extratos</h2>
          {isLoading ? (
            <div className="text-center py-20 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="font-black text-indigo-600 mb-2">Processando...</p>
            </div>
          ) : (
            <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
              <label className="cursor-pointer bg-slate-900 text-white font-black px-10 py-4 rounded-2xl text-sm uppercase tracking-widest hover:bg-black transition-all">Escolher Arquivos<input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} multiple /></label>
            </div>
          )}
        </div>
      );
    }
    if (currentView === 'companies') {
      return (
        <div className="bg-white p-12 rounded-[3rem] border border-slate-100">
          <div className="flex justify-between items-center mb-12"><h2 className="text-2xl font-black">Empresas</h2><button onClick={() => setIsAddingCompany(true)} className="bg-indigo-600 text-white font-black px-6 py-3 rounded-xl text-xs uppercase">Cadastrar</button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {uniqueCompanies.map(c => {
              const isEditing = editingCnpj === c.cnpj || editingCnpj === c.name;
              return (
              <div key={c.id} className="p-8 bg-slate-50 rounded-[2rem] border group hover:border-indigo-200 transition-all shadow-sm hover:shadow-md">
                <div className="flex justify-between mb-4">
                  <p className="text-[9px] font-black uppercase text-indigo-400">ID: {c.id?.substring(0, 8)}...</p>
                  {isEditing ? (
                    <div className="flex items-center gap-3">
                      <button onClick={() => saveCompanyEdit(editingCnpj!)} className="text-[10px] font-black uppercase text-emerald-600 hover:text-emerald-800">Salvar</button>
                      <button onClick={() => setEditingCnpj(null)} className="text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Cancelar</button>
                    </div>
                  ) : ( <button onClick={() => startEditCompany(c)} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600">Editar</button> )}
                </div>
                {isEditing ? (
                  <div className="space-y-3">
                    <input className="w-full border rounded-lg p-2 font-bold text-xs" value={editNameValue} onChange={e => setEditNameValue(e.target.value)} placeholder="Nome" />
                    <input className="w-full border rounded-lg p-2 font-bold text-xs" value={editCnpjValue} onChange={e => setEditCnpjValue(e.target.value)} placeholder="CNPJ" />
                    <textarea className="w-full border rounded-lg p-2 font-bold text-xs" value={editAltNameValue} onChange={e => setEditAltNameValue(e.target.value)} placeholder="Nomenclaturas" />
                  </div>
                ) : (
                  <>
                    <h3 className="font-black text-xl leading-tight text-slate-900">{c.name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-2">{c.cnpj || 'N/A'}</p>
                  </>
                )}
              </div>
            )})}
          </div>
          {isAddingCompany && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
              <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl">
                <h3 className="text-2xl font-black mb-6">Nova Empresa</h3>
                <form onSubmit={handleAddCompany} className="space-y-4">
                  <input required placeholder="Nome / Razão Principal" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm" />
                  <input placeholder="CNPJ" value={newCompanyCnpj} onChange={e => setNewCompanyCnpj(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm" />
                  <div className="flex gap-3 pt-6"><button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-xs">Salvar</button><button type="button" onClick={() => setIsAddingCompany(false)} className="flex-1 bg-slate-100 py-4 rounded-xl font-black uppercase text-xs">Cancelar</button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    }
    if (currentView === 'users') {
      return (
        <div className="bg-white p-12 rounded-[3rem] border border-slate-100">
          <div className="flex justify-between items-center mb-12">
            <h2 className="text-2xl font-black">Usuários</h2>
            <button onClick={() => setIsAddingUser(true)} className="bg-indigo-600 text-white font-black px-6 py-3 rounded-xl text-xs uppercase">Criar Usuário</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Login</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Senha</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Nível</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {usersList.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">{user.login}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                      <div className="relative w-32">
                          <span className="pr-8">
                              {passwordVisibility[user.id!] ? user.password : '••••••••'}
                          </span>
                          <button
                              type="button"
                              onClick={() => togglePasswordVisibility(user.id!)}
                              className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                              {passwordVisibility[user.id!] ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                              ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943-9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              )}
                          </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 capitalize">{user.role}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase inline-block border ${ user.active ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200' }`}>
                        {user.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => user.id && handleToggleUserStatus(user.id, user.active)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-colors ${ user.active ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' }`}>
                        {user.active ? 'Inativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isAddingUser && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
              <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl">
                <h3 className="text-2xl font-black mb-6">Novo Usuário</h3>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <input required placeholder="Login" value={newUserLogin} onChange={e => setNewUserLogin(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm" />
                  <input required type="email" placeholder="E-mail" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm" />
                  <div className="relative">
                    <input required type={showPassword ? "text" : "password"} placeholder="Senha" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm pr-12" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 hover:text-slate-600">
                      {showPassword ? ( <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg> ) : ( <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943-9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> )}
                    </button>
                  </div>
                  <select value={newUserRole} onChange={e => setNewUserRole(e.target.value as 'admin' | 'comum')} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm appearance-none">
                    <option value="comum">Usuário Comum</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div className="flex gap-3 pt-6"><button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-xs">Salvar</button><button type="button" onClick={() => { setIsAddingUser(false); setShowPassword(false); }} className="flex-1 bg-slate-100 py-4 rounded-xl font-black uppercase text-xs">Cancelar</button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const currentCompanyInfo = useMemo(() => {
    if (!selectedCnpj) return { name: 'Grupo Capital Dois', cnpj: 'Múltiplas Empresas' };
    const first = filteredTransactions.find(t => t.ownerCnpj === selectedCnpj);
    return { name: first?.ownerName || 'Empresa', cnpj: first?.ownerCnpj || '' };
  }, [filteredTransactions, selectedCnpj]);

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 flex print-hidden">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white border-b border-slate-100 h-16 flex items-center px-6 sticky top-0 z-30 shadow-sm">
            <div className="flex-1">
              {currentView === 'dashboard' && <input type="text" placeholder="Busca global..." className="w-64 p-2.5 bg-slate-50 border rounded-xl text-xs outline-none focus:border-indigo-400" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />}
            </div>
            <div className="flex items-center gap-3">
              {currentView === 'dashboard' && transactions.length > 0 && (
                <>
                  <button 
                    onClick={() => setIsPdfModalOpen(true)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Baixar PDF
                  </button>
                  <button 
                    onClick={async () => {
                      if (confirm("Deseja finalizar o dia e salvar os totais?")) {
                        // ... (lógica de finalizar dia)
                      }
                    }} 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100"
                  >
                    Finalizar Dia
                  </button>
                </>
              )}
            </div>
          </header>
          <main className="flex-1 p-6 overflow-y-auto">{renderContent()}</main>
        </div>

        {isPdfModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-sm shadow-2xl text-center">
              <h3 className="text-xl font-black mb-2">Gerar Relatório PDF</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-8">Selecione o tipo de relatório</p>
              <div className="space-y-4">
                <button 
                  onClick={() => { handleGeneratePdf('inflow'); setIsPdfModalOpen(false); }}
                  className="w-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-black py-4 rounded-2xl text-sm uppercase tracking-widest transition-all border border-emerald-100"
                >
                  Relatório de Entradas
                </button>
                <button 
                  onClick={() => { handleGeneratePdf('outflow'); setIsPdfModalOpen(false); }}
                  className="w-full bg-rose-50 text-rose-700 hover:bg-rose-100 font-black py-4 rounded-2xl text-sm uppercase tracking-widest transition-all border border-rose-100"
                >
                  Relatório de Saídas
                </button>
                <button 
                  onClick={() => { handleGeneratePdf('all'); setIsPdfModalOpen(false); }}
                  className="w-full bg-slate-800 text-white hover:bg-black font-black py-4 rounded-2xl text-sm uppercase tracking-widest transition-all"
                >
                  Relatório Geral
                </button>
              </div>
              <button 
                onClick={() => setIsPdfModalOpen(false)}
                className="mt-8 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
      
      {reportDataForPrint && <PrintLayout reportData={reportDataForPrint} companyInfo={currentCompanyInfo} logoUrl={logoUrl} dateRange={{ start: startDate, end: endDate }} />}
    </>
  );
};

export default App;
