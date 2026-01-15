
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Transaction, TransactionType } from './types';
import { processStatement } from './services/geminiService';
import Dashboard from './components/Dashboard';
import TransactionTable from './components/TransactionTable';
import Sidebar from './components/Sidebar';
import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
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
}

interface UserInfo {
  id?: string;
  userId: string; // ID aleatório gerado
  login: string;
  email: string;
  password?: string;
  role: 'admin' | 'comum';
  active: boolean; // Status de ativação
}

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null);
  
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfReportType, setPdfReportType] = useState<'all' | TransactionType>('all');

  const [registeredCompanies, setRegisteredCompanies] = useState<CompanyInfo[]>([]);
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCnpj, setNewCompanyCnpj] = useState('');
  const [newCompanyAltName, setNewCompanyAltName] = useState('');
  
  const [editingCnpj, setEditingCnpj] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editAltNameValue, setEditAltNameValue] = useState('');

  // Estados para Usuários
  const [usersList, setUsersList] = useState<UserInfo[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [newUserLogin, setNewUserLogin] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'comum'>('comum');

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState('dashboard');
  
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    date: '',
    ownerName: '',
    payingBank: '',
    type: '',
    origin: '',
    counterpartyName: '',
    amount: '',
    notes: ''
  });

  // Memo para empresas únicas: Filtra por CNPJ e oculta cards cujos nomes constam como nomenclatura alternativa de outra
  const uniqueCompanies = useMemo(() => {
    const seenCnpjs = new Set();
    return registeredCompanies.filter(c => {
      if (seenCnpjs.has(c.cnpj)) return false;

      // Verifica se o nome desta empresa é uma nomenclatura alternativa de QUALQUER OUTRA empresa
      const isAltOfAnother = registeredCompanies.some(other => 
        other.cnpj !== c.cnpj && 
        other.alternativeNames?.some(alt => alt.trim().toLowerCase() === c.name.trim().toLowerCase())
      );

      if (isAltOfAnother) return false;

      seenCnpjs.add(c.cnpj);
      return true;
    });
  }, [registeredCompanies]);

  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const transSnapshot = await getDocs(collection(db, "transactions"));
        const transList = transSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        })) as Transaction[];
        setTransactions(transList);

        const compSnapshot = await getDocs(collection(db, "companies"));
        const compList = compSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        })) as CompanyInfo[];
        setRegisteredCompanies(compList);

        const usersSnapshot = await getDocs(collection(db, "users"));
        const usersListData = usersSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        })) as UserInfo[];
        setUsersList(usersListData);
      } catch (err) {
        console.error("Erro ao carregar dados do Firebase:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const syncCompanies = async () => {
      const existingCnpjs = new Set(registeredCompanies.map(c => c.cnpj));
      const newCompanies: CompanyInfo[] = [];
      
      transactions.forEach(t => {
        if (!existingCnpjs.has(t.ownerCnpj)) {
          newCompanies.push({ name: t.ownerName, cnpj: t.ownerCnpj, alternativeNames: [] });
          existingCnpjs.add(t.ownerCnpj);
        }
      });

      if (newCompanies.length > 0) {
        for (const company of newCompanies) {
          try {
            const docRef = await addDoc(collection(db, "companies"), company);
            setRegisteredCompanies(prev => [...prev, { ...company, id: docRef.id }]);
          } catch (err) {
            console.error("Erro ao salvar nova empresa detectada:", err);
          }
        }
      }
    };
    
    if (transactions.length > 0) {
      syncCompanies();
    }
  }, [transactions, registeredCompanies]);

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];
    if (selectedCnpj) result = result.filter(t => t.ownerCnpj === selectedCnpj);
    result = result.filter(t => {
      const tDatePart = t.date.split('T')[0];
      if (startDate && tDatePart < startDate) return false;
      if (endDate && tDatePart > endDate) return false;
      return true;
    });
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(t => 
        t.counterpartyName.toLowerCase().includes(term) ||
        t.payingBank.toLowerCase().includes(term) ||
        t.amount.toString().includes(term) ||
        t.ownerName.toLowerCase().includes(term)
      );
    }
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedCnpj, startDate, endDate, searchTerm]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsLoading(true);
    setError(null);
    const fileList = Array.from(files) as File[];
    try {
      let currentTransactions = [...transactions];
      for (const file of fileList) {
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64 = e.target?.result?.toString().split(',')[1];
            if (base64) {
              try {
                const result = await processStatement(base64, file.type);
                const isDuplicated = result.transactions.length > 0 && result.transactions.every(newT => 
                  currentTransactions.some(existingT => 
                    existingT.date === newT.date && existingT.amount === newT.amount
                  )
                );
                if (isDuplicated) {
                  alert(`O arquivo '${file.name}' parece estar duplicado.`);
                  resolve(); return;
                }
                const addedTransactions: Transaction[] = [];
                for (const t of result.transactions) {
                  const docRef = await addDoc(collection(db, "transactions"), t);
                  addedTransactions.push({ ...t, id: docRef.id });
                }
                setTransactions(prev => [...addedTransactions, ...prev]);
                resolve();
              } catch (err: any) { reject(err); }
            } else reject(new Error("Erro ao ler arquivo"));
          };
          reader.readAsDataURL(file);
        });
      }
      setCurrentView('dashboard');
    } catch (err: any) { setError(err.message); } finally { setIsLoading(false); event.target.value = ''; }
  }, [transactions]);

  const handleUpdateTransaction = useCallback(async (id: string, updates: Partial<Transaction>) => {
    try {
      await updateDoc(doc(db, "transactions", id), updates);
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    } catch (err) { console.error(err); }
  }, []);

  const handleTriggerDeploy = async () => {
    if (confirm("Deseja iniciar um novo deploy no Render para atualizar a plataforma?")) {
      setIsLoading(true);
      try {
        await fetch("https://api.render.com/deploy/srv-d5k450fpm1nc73fqfn40?key=aaAYJonr_ic", { 
          method: 'POST', 
          mode: 'no-cors' 
        });
        alert("Deploy iniciado com sucesso no Render!");
      } catch (err) {
        try {
          await fetch("https://api.render.com/deploy/srv-d5k450fpm1nc73fqfn40?key=aaAYJonr_ic");
          alert("Deploy enviado (via GET)!");
        } catch (e) { alert("Erro ao conectar com o Render Deploy Hook."); }
      } finally { setIsLoading(false); }
    }
  };

  const generateReport = (type: 'all' | TransactionType) => {
    setPdfReportType(type);
    setIsPdfModalOpen(false);
    setTimeout(() => window.print(), 100);
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const altNames = newCompanyAltName ? newCompanyAltName.split(',').map(n => n.trim()).filter(n => n !== "") : [];
    const newCompany: CompanyInfo = { 
      name: newCompanyName, 
      cnpj: newCompanyCnpj, 
      alternativeNames: altNames 
    };
    const docRef = await addDoc(collection(db, "companies"), newCompany);
    setRegisteredCompanies(prev => [...prev, { ...newCompany, id: docRef.id }]);
    setNewCompanyName(''); setNewCompanyCnpj(''); setNewCompanyAltName(''); setIsAddingCompany(false);
  };

  const startEditCompany = (cnpj: string, currentName: string) => {
    const company = registeredCompanies.find(c => c.cnpj === cnpj);
    setEditingCnpj(cnpj); 
    setEditNameValue(currentName);
    setEditAltNameValue(company?.alternativeNames?.join(', ') || '');
  };

  const saveCompanyEdit = async (cnpj: string) => {
    const company = registeredCompanies.find(c => c.cnpj === cnpj);
    if (!company?.id) return;
    const altNames = editAltNameValue ? editAltNameValue.split(',').map(n => n.trim()).filter(n => n !== "") : [];
    
    // Se o nome mudou, guarda o antigo como originalName para exibição posterior
    const hasNameChanged = editNameValue.trim() !== company.name.trim();
    const updatedOriginalName = hasNameChanged ? company.name : (company.originalName || '');

    await updateDoc(doc(db, "companies", company.id), { 
      name: editNameValue,
      originalName: updatedOriginalName,
      alternativeNames: altNames
    });
    
    setRegisteredCompanies(prev => prev.map(c => c.cnpj === cnpj ? { ...c, name: editNameValue, originalName: updatedOriginalName, alternativeNames: altNames } : c));
    setTransactions(prev => prev.map(t => t.ownerCnpj === cnpj ? { ...t, ownerName: editNameValue } : t));
    setEditingCnpj(null);
  };

  const generateRandomID = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const newUser: UserInfo = {
      userId: generateRandomID(),
      login: newUserLogin,
      email: newUserEmail,
      password: newUserPassword,
      role: newUserRole,
      active: true
    };
    try {
      const docRef = await addDoc(collection(db, "users"), newUser);
      setUsersList(prev => [...prev, { ...newUser, id: docRef.id }]);
      setNewUserLogin(''); setNewUserEmail(''); setNewUserPassword(''); setNewUserRole('comum');
      setIsAddingUser(false);
      alert("Usuário cadastrado com sucesso!");
    } catch (err) {
      console.error("Erro ao cadastrar usuário:", err);
      alert("Erro ao cadastrar usuário.");
    }
  };

  const handleToggleUserStatus = async (user: UserInfo) => {
    if (!user.id) return;
    const newStatus = !user.active;
    try {
      await updateDoc(doc(db, "users", user.id), { active: newStatus });
      setUsersList(prev => prev.map(u => u.id === user.id ? { ...u, active: newStatus } : u));
    } catch (err) {
      console.error("Erro ao alterar status do usuário:", err);
    }
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser?.id) return;
    try {
      const updates = {
        login: editingUser.login,
        email: editingUser.email,
        password: editingUser.password,
        role: editingUser.role
      };
      await updateDoc(doc(db, "users", editingUser.id), updates);
      setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...updates } : u));
      setEditingUser(null);
      alert("Usuário atualizado com sucesso!");
    } catch (err) {
      console.error("Erro ao atualizar usuário:", err);
    }
  };

  const reportTransactions = useMemo(() => pdfReportType === 'all' ? filteredTransactions : filteredTransactions.filter(t => t.type === pdfReportType), [filteredTransactions, pdfReportType]);

  const renderContent = () => {
    if (currentView === 'dashboard') {
      return (
        <>
          {transactions.length > 0 ? (
            <>
              <div className="flex flex-col lg:flex-row justify-between items-start gap-6 mb-8 print-hidden">
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-black text-slate-900">Gestor Financeiro</h2>
                  <p className="text-sm text-slate-500 font-medium">Análise consolidada e filtros ativos</p>
                </div>
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 w-full lg:w-auto">
                  <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-[10px] font-black bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 outline-none" />
                    <span className="text-[10px] text-slate-400 font-black">até</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-[10px] font-black bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 outline-none" />
                  </div>
                  <select className="bg-white p-2 rounded-xl text-[10px] font-black border border-slate-100" value={selectedCnpj || ""} onChange={(e) => setSelectedCnpj(e.target.value || null)}>
                    <option value="">Grupo Capital Dois</option>
                    {uniqueCompanies.map(c => <option key={c.cnpj} value={c.cnpj}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-10 print-hidden">
                <Dashboard transactions={filteredTransactions} selectedCnpj={selectedCnpj} logoUrl={logoUrl} onLogoChange={setLogoUrl} />
                <TransactionTable transactions={filteredTransactions} allTransactions={transactions} onUpdateTransaction={handleUpdateTransaction} selectedCnpj={selectedCnpj} columnFilters={columnFilters} onColumnFilterChange={(f, v) => setColumnFilters(p => ({ ...p, [f]: v }))} />
              </div>
            </>
          ) : (
            <div className="text-center py-32 bg-white rounded-[3rem] border border-slate-100 print-hidden">
              <h2 className="text-3xl font-black mb-10">Bem-vindo ao FlowState</h2>
              <button onClick={() => setCurrentView('import')} className="bg-indigo-600 text-white font-black px-10 py-4 rounded-2xl text-sm uppercase tracking-widest">Importar Extratos</button>
            </div>
          )}
        </>
      );
    }
    if (currentView === 'import') {
      return (
        <div className="max-w-4xl mx-auto print-hidden">
          <h2 className="text-2xl font-black mb-8">Importação de Extratos</h2>
          {isLoading ? (
            <div className="text-center py-20 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="font-black text-indigo-600 mb-2">Processando extratos com IA...</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Tempo decorrido: {elapsedTime}s</p>
            </div>
          ) : (
            <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
              <label className="cursor-pointer bg-slate-900 text-white font-black px-10 py-4 rounded-2xl text-sm uppercase tracking-widest">Escolher Arquivos<input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} multiple /></label>
            </div>
          )}
        </div>
      );
    }
    if (currentView === 'companies') {
      return (
        <div className="bg-white p-12 rounded-[3rem] border border-slate-100 print-hidden">
          <div className="flex justify-between items-center mb-12"><h2 className="text-2xl font-black">Empresas</h2><button onClick={() => setIsAddingCompany(true)} className="bg-indigo-600 text-white font-black px-6 py-3 rounded-xl text-xs uppercase">Cadastrar</button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {uniqueCompanies.map(c => (
              <div key={c.cnpj} className="p-8 bg-slate-50 rounded-[2rem] border group hover:border-indigo-200 transition-all shadow-sm hover:shadow-md">
                <div className="flex justify-between mb-4">
                  <p className="text-[9px] font-black uppercase text-indigo-400">ID: {c.id?.substring(0, 8)}...</p>
                  <button onClick={() => editingCnpj === c.cnpj ? saveCompanyEdit(c.cnpj) : startEditCompany(c.cnpj, c.name)} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600">{editingCnpj === c.cnpj ? 'Salvar' : 'Editar'}</button>
                </div>
                {editingCnpj === c.cnpj ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Nome da Empresa</p>
                      <input className="w-full border rounded-lg p-2 font-bold text-xs" value={editNameValue} onChange={e => setEditNameValue(e.target.value)} placeholder="Nome" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Esse CNPJ possui outra nomenclatura?</p>
                      <input className="w-full border rounded-lg p-2 font-bold text-xs" value={editAltNameValue} onChange={e => setEditAltNameValue(e.target.value)} placeholder="Ex: Nome Outro, Nomenclatura 2" />
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="font-black text-xl leading-tight text-slate-900">{c.name}</h3>
                    {c.originalName && c.originalName !== c.name && (
                      <p className="text-[10px] text-slate-400 font-bold italic mt-0.5">{c.originalName}</p>
                    )}
                    <p className="text-xs text-slate-500 font-mono mt-2">{c.cnpj}</p>
                    {c.alternativeNames && c.alternativeNames.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nomenclaturas Atreladas:</p>
                        <div className="flex flex-wrap gap-1">
                          {c.alternativeNames.map(alt => (
                            <span key={alt} className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded text-[9px] font-bold">{alt}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          {isAddingCompany && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
              <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl">
                <h3 className="text-2xl font-black mb-6">Nova Empresa</h3>
                <form onSubmit={handleAddCompany} className="space-y-4">
                  <input required placeholder="Nome Fantasia / Razão Social" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl outline-none font-bold text-sm" />
                  <input required placeholder="CNPJ" value={newCompanyCnpj} onChange={e => setNewCompanyCnpj(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl outline-none font-bold text-sm" />
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1 px-1">Esse CNPJ possui outra nomenclatura?</p>
                    <input placeholder="Separe por vírgula se houver mais de uma" value={newCompanyAltName} onChange={e => setNewCompanyAltName(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl outline-none font-bold text-sm" />
                  </div>
                  <div className="flex gap-3 pt-6"><button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest">Salvar Empresa</button><button type="button" onClick={() => setIsAddingCompany(false)} className="flex-1 bg-slate-100 py-4 rounded-xl font-black uppercase text-xs tracking-widest">Cancelar</button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    }
    if (currentView === 'users') {
      return (
        <div className="bg-white p-12 rounded-[3rem] border border-slate-100 print-hidden">
          <div className="flex justify-between items-center mb-12">
            <h2 className="text-2xl font-black">Usuários</h2>
            <button 
              onClick={() => setIsAddingUser(true)} 
              className="bg-indigo-600 text-white font-black px-6 py-3 rounded-xl text-xs uppercase shadow-lg shadow-indigo-100 active:scale-95 transition-all"
            >
              Cadastrar Usuário
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {usersList.map(u => (
              <div key={u.id} className={`p-8 rounded-[2rem] border group transition-all shadow-sm ${u.active ? 'bg-slate-50 border-slate-100' : 'bg-slate-100 border-slate-200 opacity-60'}`}>
                <div className="flex justify-between mb-4">
                  <p className="text-[9px] font-black uppercase text-indigo-400">ID: {u.userId}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingUser(u)} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600">Editar</button>
                    <button onClick={() => handleToggleUserStatus(u)} className={`text-[10px] font-black uppercase ${u.active ? 'text-rose-500 hover:text-rose-600' : 'text-emerald-500 hover:text-emerald-600'}`}>
                      {u.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm ${u.active ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}>
                    {u.login.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-lg text-slate-900 truncate" title={u.login}>{u.login}</h3>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded inline-block ${u.role === 'admin' ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-700'}`}>
                      {u.role}
                    </span>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">E-mail</p>
                  <p className="text-xs text-slate-700 font-bold truncate">{u.email}</p>
                </div>
              </div>
            ))}
            {usersList.length === 0 && (
              <div className="col-span-full py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-black text-xs uppercase">Nenhum usuário cadastrado</p>
              </div>
            )}
          </div>

          {isAddingUser && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
              <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
                <h3 className="text-2xl font-black mb-6 text-slate-900">Novo Usuário</h3>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <input required placeholder="Login" value={newUserLogin} onChange={e => setNewUserLogin(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl outline-none font-bold text-sm focus:border-indigo-400 transition-all" />
                  <input required type="email" placeholder="E-mail" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl outline-none font-bold text-sm focus:border-indigo-400 transition-all" />
                  <input required type="password" placeholder="Senha" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl outline-none font-bold text-sm focus:border-indigo-400 transition-all" />
                  
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase px-1">Perfil de Acesso</p>
                    <div className="flex gap-2">
                      <button 
                        type="button" 
                        onClick={() => setNewUserRole('admin')}
                        className={`flex-1 py-3 rounded-xl font-black text-xs uppercase border transition-all ${newUserRole === 'admin' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-600'}`}
                      >
                        Admin
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setNewUserRole('comum')}
                        className={`flex-1 py-3 rounded-xl font-black text-xs uppercase border transition-all ${newUserRole === 'comum' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-600'}`}
                      >
                        Comum
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-6">
                    <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Salvar</button>
                    <button type="button" onClick={() => setIsAddingUser(false)} className="flex-1 bg-slate-100 py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {editingUser && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
              <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
                <h3 className="text-2xl font-black mb-6 text-slate-900">Editar Usuário</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-6">ID: {editingUser.userId}</p>
                <form onSubmit={handleSaveUserEdit} className="space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase px-1 mb-1">Login</p>
                    <input required placeholder="Login" value={editingUser.login} onChange={e => setEditingUser({...editingUser, login: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-xl outline-none font-bold text-sm focus:border-indigo-400 transition-all" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase px-1 mb-1">E-mail</p>
                    <input required type="email" placeholder="E-mail" value={editingUser.email} onChange={e => setEditingUser({...editingUser, email: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-xl outline-none font-bold text-sm focus:border-indigo-400 transition-all" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase px-1 mb-1">Nova Senha</p>
                    <input type="password" placeholder="Mudar Senha" value={editingUser.password} onChange={e => setEditingUser({...editingUser, password: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-xl outline-none font-bold text-sm focus:border-indigo-400 transition-all" />
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase px-1">Perfil de Acesso</p>
                    <div className="flex gap-2">
                      <button 
                        type="button" 
                        onClick={() => setEditingUser({...editingUser, role: 'admin'})}
                        className={`flex-1 py-3 rounded-xl font-black text-xs uppercase border transition-all ${editingUser.role === 'admin' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-600'}`}
                      >
                        Admin
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setEditingUser({...editingUser, role: 'comum'})}
                        className={`flex-1 py-3 rounded-xl font-black text-xs uppercase border transition-all ${editingUser.role === 'comum' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-600'}`}
                      >
                        Comum
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-6">
                    <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Salvar Alterações</button>
                    <button type="button" onClick={() => setEditingUser(null)} className="flex-1 bg-slate-100 py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-100 h-16 flex items-center px-6 sticky top-0 z-30 shadow-sm print-hidden">
          <div className="flex-1">
            {currentView === 'dashboard' && <input type="text" placeholder="Busca global em transações..." className="w-64 p-2.5 bg-slate-50 border rounded-xl text-xs outline-none focus:border-indigo-400 transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />}
          </div>
          <div className="flex items-center gap-3">
            {currentView === 'dashboard' && (
              <>
                {transactions.length > 0 && (
                  <>
                    <button onClick={() => setIsPdfModalOpen(true)} className="bg-white hover:bg-slate-50 border px-4 py-2 rounded-xl text-sm font-bold text-slate-600 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      PDF
                    </button>
                    <button onClick={async () => {
                      if (confirm("Deseja finalizar o dia e salvar os totais?")) {
                        const summary = filteredTransactions.reduce((acc, t) => {
                          if (t.type === TransactionType.INFLOW) acc.totalInflow += t.amount;
                          else acc.totalOutflow += t.amount;
                          return acc;
                        }, { totalInflow: 0, totalOutflow: 0 });
                        await addDoc(collection(db, "Dashboard"), { timestamp: new Date().toISOString(), entradas: summary.totalInflow, saidas: summary.totalOutflow, saldo: summary.totalInflow - summary.totalOutflow });
                        alert("Resumo do dia salvo na base de dados!");
                      }
                    }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Finalizar Dia
                    </button>
                  </>
                )}
                <button onClick={handleTriggerDeploy} className="bg-slate-900 hover:bg-black text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-slate-200 transition-all active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  Deploy Render
                </button>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">{renderContent()}</main>
        {isPdfModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-sm shadow-2xl">
               <h3 className="text-2xl font-black mb-8 text-center text-slate-900">Exportar Relatório</h3>
               <div className="space-y-3">
                  <button onClick={() => generateReport(TransactionType.OUTFLOW)} className="w-full py-4 px-6 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-2xl font-black text-xs uppercase text-left flex justify-between">Saídas <span>→</span></button>
                  <button onClick={() => generateReport(TransactionType.INFLOW)} className="w-full py-4 px-6 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-2xl font-black text-xs uppercase text-left flex justify-between">Entradas <span>→</span></button>
                  <button onClick={() => generateReport('all')} className="w-full py-4 px-6 bg-slate-900 text-white hover:bg-black rounded-2xl font-black text-xs uppercase text-left flex justify-between">Geral <span>→</span></button>
               </div>
               <button onClick={() => setIsPdfModalOpen(false)} className="w-full mt-6 text-slate-400 font-bold text-[10px] uppercase">Fechar</button>
            </div>
          </div>
        )}
      </div>
      <div id="report-print-area">
         <h1 style={{ textAlign: 'center', marginBottom: '40px', fontSize: '24px' }}>RELATÓRIO FINANCEIRO - FLOWSTATE</h1>
         <div style={{ marginBottom: '20px' }}>
            <p><strong>Emissão:</strong> {new Date().toLocaleDateString('pt-BR')}</p>
            <p><strong>Filtro:</strong> {pdfReportType === 'all' ? 'Geral' : pdfReportType === TransactionType.INFLOW ? 'Entradas' : 'Saídas'}</p>
         </div>
         <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
               <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ border: '1px solid #ddd', padding: '12px' }}>Data</th>
                  <th style={{ border: '1px solid #ddd', padding: '12px' }}>Valor</th>
                  <th style={{ border: '1px solid #ddd', padding: '12px' }}>Origem / Descrição</th>
                  <th style={{ border: '1px solid #ddd', padding: '12px' }}>Banco</th>
               </tr>
            </thead>
            <tbody>
               {reportTransactions.map(t => (
                  <tr key={t.id}>
                     <td style={{ border: '1px solid #ddd', padding: '10px' }}>{t.date.split('T')[0].split('-').reverse().join('/')}</td>
                     <td style={{ border: '1px solid #ddd', padding: '10px', fontWeight: 'bold' }}>R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                     <td style={{ border: '1px solid #ddd', padding: '10px' }}>{t.origin || t.description}</td>
                     <td style={{ border: '1px solid #ddd', padding: '10px' }}>{t.ownerBank}</td>
                  </tr>
               ))}
            </tbody>
         </table>
         <div style={{ marginTop: '30px', textAlign: 'right', fontSize: '18px', fontWeight: 'bold' }}>
            TOTAL: R$ {reportTransactions.reduce((acc, t) => acc + (t.type === TransactionType.INFLOW ? t.amount : -t.amount), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
         </div>
      </div>
    </div>
  );
};

export default App;
