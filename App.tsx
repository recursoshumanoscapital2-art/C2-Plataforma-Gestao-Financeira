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

interface UserInfo {
  id?: string;
  userId: string;
  login: string;
  email: string;
  password?: string;
  role: 'admin' | 'comum';
  active: boolean;
}

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false); 
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null);
  
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfReportType, setPdfReportType] = useState<'all' | TransactionType>('all');

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

  const uniqueCompanies = useMemo(() => {
    return registeredCompanies.filter(c => !c.hidden);
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
    fetchData();
  }, []);

  useEffect(() => {
    const syncCompanies = async () => {
      if (!isDataLoaded || transactions.length === 0) return;

      const allKnownNames = new Set<string>();
      registeredCompanies.forEach(c => {
        allKnownNames.add(c.name.trim().toLowerCase());
        c.alternativeNames?.forEach(alt => allKnownNames.add(alt.trim().toLowerCase()));
      });
      
      const newCompaniesToAdd: CompanyInfo[] = [];
      const namesAddedInThisBatch = new Set<string>();
      
      transactions.forEach(t => {
        const nameLower = t.ownerName?.trim().toLowerCase();
        if (nameLower && !allKnownNames.has(nameLower) && !namesAddedInThisBatch.has(nameLower)) {
          newCompaniesToAdd.push({ 
            name: t.ownerName.trim(), 
            cnpj: (t.ownerCnpj || '').trim(), 
            alternativeNames: [],
            hidden: false
          });
          namesAddedInThisBatch.add(nameLower);
        }
      });

      if (newCompaniesToAdd.length > 0) {
        const addedToState: CompanyInfo[] = [];
        for (const company of newCompaniesToAdd) {
          try {
            const docRef = await addDoc(collection(db, "companies"), company);
            addedToState.push({ ...company, id: docRef.id });
          } catch (err) { console.error("Erro ao sincronizar empresa:", err); }
        }
        setRegisteredCompanies(prev => [...prev, ...addedToState]);
      }
    };
    syncCompanies();
  }, [isDataLoaded, transactions, registeredCompanies.length]); 

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
      result = result.filter(t => 
        (t.counterpartyName || '').toLowerCase().includes(term) ||
        (t.payingBank || '').toLowerCase().includes(term) ||
        (t.amount || 0).toString().includes(term) ||
        (t.ownerName || '').toLowerCase().includes(term) ||
        (t.description || '').toLowerCase().includes(term) ||
        (t.notes && t.notes.toLowerCase().includes(term))
      );
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
    return result.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });
  }, [transactions, selectedCnpj, startDate, endDate, searchTerm, columnFilters]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsLoading(true);
    setError(null);
    const fileList = Array.from(files) as File[];
    
    try {
      let currentTransactions = [...transactions];
      for (const file of fileList) {
        // Todos os arquivos, incluindo PDF, serão processados pelo Gemini
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result?.toString().split(',')[1] || "");
          reader.onerror = (e) => reject(new Error("Erro ao ler arquivo"));
          reader.readAsDataURL(file);
        });
        const result = await processStatement(base64, file.type);

        const isDuplicated = result.transactions.length > 0 && result.transactions.every(newT => 
          currentTransactions.some(existingT => 
            existingT.date === newT.date && Math.abs(existingT.amount - newT.amount) < 0.01
          )
        );
        
        if (isDuplicated) { 
          alert(`Arquivo '${file.name}' já foi importado anteriormente.`); 
          continue; 
        }

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
  }, [transactions]);

  const handleUpdateTransaction = useCallback(async (id: string, updates: Partial<Transaction>) => {
    try {
      await updateDoc(doc(db, "transactions", id), updates);
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    } catch (err) { console.error(err); }
  }, []);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const allKnownNames = new Set<string>();
    registeredCompanies.forEach(c => {
      allKnownNames.add(c.name.trim().toLowerCase());
    });

    if (allKnownNames.has(newCompanyName.trim().toLowerCase())) {
      alert("Empresa já cadastrada.");
      return;
    }

    const altNames = newCompanyAltNames ? newCompanyAltNames.split(',').map(n => n.trim()).filter(n => n !== "") : [];
    const newCompany: CompanyInfo = { 
      name: newCompanyName.trim(), 
      cnpj: newCompanyCnpj.trim() || '', 
      alternativeNames: altNames,
      hidden: false
    };

    try {
      const docRef = await addDoc(collection(db, "companies"), newCompany);
      setRegisteredCompanies(prev => [...prev, { ...newCompany, id: docRef.id }]);
      setNewCompanyName(''); setNewCompanyCnpj(''); setNewCompanyAltNames(''); setIsAddingCompany(false);
    } catch (err) {
      alert("Erro ao salvar empresa.");
    }
  };

  const startEditCompany = (cnpj: string, currentName: string) => {
    const company = registeredCompanies.find(c => (c.cnpj && c.cnpj === cnpj) || c.name === currentName);
    if (!company) return;
    setEditingCnpj(cnpj || company.name); 
    setEditNameValue(company.name);
    setEditCnpjValue(company.cnpj);
    setEditAltNameValue(company.alternativeNames?.join(', ') || '');
  };

  const saveCompanyEdit = async (identifier: string) => {
    const company = registeredCompanies.find(c => c.cnpj === identifier || c.name === identifier);
    if (!company?.id) return;
    const altNames = editAltNameValue ? editAltNameValue.split(',').map(n => n.trim()).filter(n => n !== "") : [];
    
    const updates: any = { 
      name: editNameValue.trim(), 
      cnpj: editCnpjValue.trim(), 
      alternativeNames: altNames 
    };

    // Sempre que o nome for atualizado, guardamos o nome anterior em originalName
    if (editNameValue.trim() !== company.name) {
      updates.originalName = company.name;
    }

    await updateDoc(doc(db, "companies", company.id), updates);
    setRegisteredCompanies(prev => prev.map(c => c.id === company.id ? { ...c, ...updates } : c));
    setEditingCnpj(null);
  };

  const renderContent = () => {
    if (currentView === 'dashboard') {
      return (
        <>
          {transactions.length > 0 ? (
            <>
              <div className="flex flex-col lg:flex-row justify-between items-start gap-6 mb-8 print-hidden">
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
              <div className="space-y-10 print-hidden">
                <Dashboard transactions={filteredTransactions} selectedCnpj={selectedCnpj} logoUrl={logoUrl} onLogoChange={setLogoUrl} />
                <TransactionTable transactions={filteredTransactions} allTransactions={transactions} onUpdateTransaction={handleUpdateTransaction} selectedCnpj={selectedCnpj} columnFilters={columnFilters} onColumnFilterChange={(f, v) => setColumnFilters(p => ({ ...p, [f]: v }))} />
              </div>
            </>
          ) : (
            <div className="text-center py-32 bg-white rounded-[3rem] border border-slate-100 print-hidden">
              <h2 className="text-3xl font-black mb-10 text-slate-900">Bem-vindo ao FlowState</h2>
              <button onClick={() => setCurrentView('import')} className="bg-indigo-600 text-white font-black px-10 py-4 rounded-2xl text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Importar Extratos</button>
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
              <p className="font-black text-indigo-600 mb-2">Processando com Inteligência Artificial...</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Extraindo dados e classificando transações</p>
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
        <div className="bg-white p-12 rounded-[3rem] border border-slate-100 print-hidden">
          <div className="flex justify-between items-center mb-12"><h2 className="text-2xl font-black">Empresas</h2><button onClick={() => setIsAddingCompany(true)} className="bg-indigo-600 text-white font-black px-6 py-3 rounded-xl text-xs uppercase">Cadastrar</button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {uniqueCompanies.map(c => {
              const isEditing = editingCnpj === c.cnpj || editingCnpj === c.name;
              return (
              <div key={c.id} className="p-8 bg-slate-50 rounded-[2rem] border group hover:border-indigo-200 transition-all shadow-sm hover:shadow-md">
                <div className="flex justify-between mb-4">
                  <p className="text-[9px] font-black uppercase text-indigo-400">ID: {c.id?.substring(0, 8)}...</p>
                  <button onClick={() => isEditing ? saveCompanyEdit(editingCnpj!) : startEditCompany(c.cnpj, c.name)} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600">{isEditing ? 'Salvar' : 'Editar'}</button>
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
                    {c.originalName && (
                      <p className="text-[10px] text-slate-400 font-medium italic -mt-1">{c.originalName}</p>
                    )}
                    <p className="text-xs text-slate-500 font-mono mt-2">{c.cnpj || 'CNPJ não informado (Preencher manualmente)'}</p>
                    {c.alternativeNames && c.alternativeNames.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
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
            )})}
          </div>
          {isAddingCompany && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
              <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl">
                <h3 className="text-2xl font-black mb-6">Nova Empresa</h3>
                <form onSubmit={handleAddCompany} className="space-y-4">
                  <input required placeholder="Nome / Razão Principal" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm" />
                  <input placeholder="CNPJ (Deixe vazio se não souber)" value={newCompanyCnpj} onChange={e => setNewCompanyCnpj(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm" />
                  <div className="flex gap-3 pt-6"><button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-xs">Salvar</button><button type="button" onClick={() => setIsAddingCompany(false)} className="flex-1 bg-slate-100 py-4 rounded-xl font-black uppercase text-xs">Cancelar</button></div>
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
            {currentView === 'dashboard' && transactions.length > 0 && (
              <button 
                onClick={async () => {
                  if (confirm("Deseja finalizar o dia e salvar os totais?")) {
                    const summary = filteredTransactions.reduce((acc, t) => {
                      if (t.type === TransactionType.INFLOW) acc.totalInflow += t.amount;
                      else acc.totalOutflow += t.amount;
                      return acc;
                    }, { totalInflow: 0, totalOutflow: 0 });
                    await addDoc(collection(db, "Dashboard"), { 
                      timestamp: new Date().toISOString(), 
                      entradas: summary.totalInflow, 
                      saidas: summary.totalOutflow, 
                      saldo: summary.totalInflow - summary.totalOutflow,
                      empresa: selectedCnpj ? transactions.find(t => t.ownerCnpj === selectedCnpj)?.ownerName : "Grupo Capital Dois"
                    });
                    alert("Resumo do dia salvo com sucesso!");
                  }
                }} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all active:scale-95"
              >
                Finalizar Dia
              </button>
            )}
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">{renderContent()}</main>
      </div>
    </div>
  );
};

export default App;
