
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

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null);
  
  // PDF Modal State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfReportType, setPdfReportType] = useState<'all' | TransactionType>('all');

  // Companies tracking
  const [registeredCompanies, setRegisteredCompanies] = useState<CompanyInfo[]>([]);
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCnpj, setNewCompanyCnpj] = useState('');
  const [newCompanyAltName, setNewCompanyAltName] = useState('');
  const [editingCnpj, setEditingCnpj] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  // Manual date range state initialized to empty
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState('dashboard');
  
  // Column-specific filters
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

  // Load data from Firebase on mount
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
      } catch (err) {
        console.error("Erro ao carregar dados do Firebase:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Sync registered companies from transactions
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

    if (selectedCnpj) {
      result = result.filter(t => t.ownerCnpj === selectedCnpj);
    }

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
        t.paymentMethod.toLowerCase().includes(term) ||
        t.amount.toString().includes(term) ||
        t.origin.toLowerCase().includes(term) ||
        t.description.toLowerCase().includes(term) ||
        t.ownerName.toLowerCase().includes(term)
      );
    }

    Object.keys(columnFilters).forEach((key) => {
      const filterVal = columnFilters[key as keyof ColumnFilters].toLowerCase();
      if (filterVal) {
        result = result.filter(t => {
          if (key === 'date') {
            const transactionDatePart = t.date.split('T')[0];
            return transactionDatePart === filterVal;
          }
          if (key === 'ownerName') return t.ownerName.toLowerCase().includes(filterVal);
          if (key === 'payingBank') return t.payingBank.toLowerCase().includes(filterVal);
          if (key === 'type') return t.type.toLowerCase().includes(filterVal);
          if (key === 'origin') return t.origin.toLowerCase().includes(filterVal);
          if (key === 'counterpartyName') return t.counterpartyName.toLowerCase().includes(filterVal);
          if (key === 'amount') return t.amount.toString().includes(filterVal);
          if (key === 'notes') return t.notes.toLowerCase().includes(filterVal);
          return true;
        });
      }
    });

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64 = e.target?.result?.toString().split(',')[1];
            if (base64) {
              try {
                const result = await processStatement(base64, file.type);
                
                const isDuplicatedFile = result.transactions.length > 0 && result.transactions.every(newT => 
                  currentTransactions.some(existingT => 
                    existingT.date === newT.date && 
                    existingT.ownerBank === newT.ownerBank && 
                    existingT.amount === newT.amount
                  )
                );

                if (isDuplicatedFile) {
                  alert(`PDF em duplicidade interrompido: O arquivo '${file.name}' possui a mesma data, banco e valores exatamente iguais aos dados já presentes.`);
                  resolve();
                  return;
                }

                const addedTransactions: Transaction[] = [];
                for (const t of result.transactions) {
                  const docRef = await addDoc(collection(db, "transactions"), t);
                  addedTransactions.push({ ...t, id: docRef.id });
                }

                setTransactions(prev => {
                  const updated = [...addedTransactions, ...prev];
                  currentTransactions = updated;
                  return updated;
                });
                resolve();
              } catch (err: any) {
                console.error(`Erro ao processar arquivo ${file.name}:`, err);
                reject(new Error(`Falha no arquivo ${file.name}`));
              }
            } else {
              reject(new Error("Base64 não gerado"));
            }
          };
          reader.onerror = () => reject(new Error("Erro de leitura"));
          reader.readAsDataURL(file);
        });
      }
      setCurrentView('dashboard');
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro ao processar um ou mais extratos.");
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  }, [transactions]);

  const handleUpdateTransaction = useCallback(async (id: string, updates: Partial<Transaction>) => {
    try {
      const transactionRef = doc(db, "transactions", id);
      await updateDoc(transactionRef, updates);
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    } catch (err) {
      console.error("Erro ao atualizar transação no Firebase:", err);
    }
  }, []);

  const handleColumnFilterChange = (field: keyof ColumnFilters, value: string) => {
    setColumnFilters(prev => ({ ...prev, [field]: value }));
  };

  const clearAllData = async () => {
    if (confirm("Deseja realmente limpar todos os dados importados?")) {
      try {
        setIsLoading(true);
        const transSnapshot = await getDocs(collection(db, "transactions"));
        for (const d of transSnapshot.docs) {
          await deleteDoc(doc(db, "transactions", d.id));
        }
        
        const compSnapshot = await getDocs(collection(db, "companies"));
        for (const d of compSnapshot.docs) {
          await deleteDoc(doc(db, "companies", d.id));
        }

        setTransactions([]);
        setSelectedCnpj(null);
        setRegisteredCompanies([]);
        setSearchTerm('');
        setColumnFilters({
          date: '', ownerName: '', payingBank: '', type: '', origin: '', 
          counterpartyName: '', amount: '', notes: ''
        });
      } catch (err) {
        console.error("Erro ao limpar dados do Firebase:", err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleFinalizeDay = async () => {
    if (confirm("Deseja finalizar o dia e sincronizar os dados com o banco?")) {
      try {
        setIsLoading(true);
        const summary = filteredTransactions.reduce((acc, t) => {
          if (t.type === TransactionType.INFLOW) acc.totalInflow += t.amount;
          else acc.totalOutflow += t.amount;
          return acc;
        }, { totalInflow: 0, totalOutflow: 0 });

        const paymentMethods: Record<string, number> = {};
        filteredTransactions.forEach(t => {
          paymentMethods[t.paymentMethod] = (paymentMethods[t.paymentMethod] || 0) + 1;
        });

        const evolution: Record<string, { inflow: number, outflow: number }> = {};
        filteredTransactions.forEach(t => {
          const day = t.date.split('T')[0];
          if (!evolution[day]) evolution[day] = { inflow: 0, outflow: 0 };
          if (t.type === TransactionType.INFLOW) evolution[day].inflow += t.amount;
          else evolution[day].outflow += t.amount;
        });

        const dashboardData = {
          timestamp: new Date().toISOString(),
          ownerCnpj: selectedCnpj || "consolidado",
          ownerName: selectedCnpj ? (transactions.find(t => t.ownerCnpj === selectedCnpj)?.ownerName || "Empresa") : "Grupo Capital Dois",
          entradas: summary.totalInflow,
          saidas: summary.totalOutflow,
          saldoLiquido: summary.totalInflow - summary.totalOutflow,
          metodosPagamento: paymentMethods,
          evolucaoNoFiltro: evolution,
          filtrosAplicados: { startDate, endDate, searchTerm, columnFilters }
        };

        await addDoc(collection(db, "Dashboard"), dashboardData);
        alert("Dia finalizado com sucesso! Dados salvos na coleção Dashboard.");
      } catch (err) {
        console.error("Erro ao salvar no Dashboard:", err);
        alert("Erro ao tentar salvar os dados no Dashboard.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleTriggerDeploy = async () => {
    if (confirm("Deseja iniciar um novo deploy no Render para atualizar a versão live da plataforma?")) {
      setIsLoading(true);
      try {
        // Tentativa primária via POST (padrão para Hooks de Deploy)
        await fetch("https://api.render.com/deploy/srv-d5k450fpm1nc73fqfn40?key=aaAYJonr_ic", {
          method: 'POST',
          mode: 'no-cors' // Render hooks aceitam no-cors para disparos simples do browser
        });
        alert("Comando de deploy enviado com sucesso! O Render iniciará a atualização em instantes.");
      } catch (err) {
        console.error("Erro ao disparar deploy:", err);
        // Tentativa secundária via GET caso o hook esteja configurado apenas para requisições simples
        try {
          await fetch("https://api.render.com/deploy/srv-d5k450fpm1nc73fqfn40?key=aaAYJonr_ic");
          alert("Comando de deploy enviado (via GET)! O Render iniciará a atualização.");
        } catch (getErr) {
          alert("Erro ao conectar com a API do Render. Verifique o Hook nas configurações do seu serviço.");
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDownloadPDF = () => {
    setIsPdfModalOpen(true);
  };

  const generateReport = (type: 'all' | TransactionType) => {
    setPdfReportType(type);
    setIsPdfModalOpen(false);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName || !newCompanyCnpj) return;
    const newCompany: CompanyInfo = { 
      name: newCompanyName, 
      cnpj: newCompanyCnpj,
      alternativeNames: newCompanyAltName ? [newCompanyAltName] : []
    };
    try {
      const docRef = await addDoc(collection(db, "companies"), newCompany);
      setRegisteredCompanies(prev => [...prev, { ...newCompany, id: docRef.id }]);
      setNewCompanyName('');
      setNewCompanyCnpj('');
      setNewCompanyAltName('');
      setIsAddingCompany(false);
    } catch (err) {
      console.error("Erro ao adicionar empresa:", err);
    }
  };

  const handleAddAltName = async (cnpj: string, name: string) => {
    if (!name.trim()) return;
    const company = registeredCompanies.find(c => c.cnpj === cnpj);
    if (company && company.id) {
      const updatedAltNames = [...(company.alternativeNames || []), name.trim()];
      try {
        await updateDoc(doc(db, "companies", company.id), { alternativeNames: updatedAltNames });
        setRegisteredCompanies(prev => prev.map(c => 
          c.cnpj === cnpj ? { ...c, alternativeNames: updatedAltNames } : c
        ));
      } catch (err) {
        console.error("Erro ao adicionar nomenclatura alternativa:", err);
      }
    }
  };

  const startEditCompany = (cnpj: string, currentName: string) => {
    setEditingCnpj(cnpj);
    setEditNameValue(currentName);
  };

  const saveCompanyEdit = async (cnpj: string) => {
    const company = registeredCompanies.find(c => c.cnpj === cnpj);
    if (!company || !company.id) return;
    const updates = { name: editNameValue, originalName: company.originalName || company.name };
    try {
      await updateDoc(doc(db, "companies", company.id), updates);
      setRegisteredCompanies(prev => prev.map(c => c.cnpj === cnpj ? { ...c, ...updates } : c));
      setTransactions(prev => prev.map(t => t.ownerCnpj === cnpj ? { ...t, ownerName: editNameValue } : t));
      setEditingCnpj(null);
    } catch (err) {
      console.error("Erro ao salvar edição da empresa:", err);
    }
  };

  const reportTransactions = useMemo(() => {
    if (pdfReportType === 'all') return filteredTransactions;
    return filteredTransactions.filter(t => t.type === pdfReportType);
  }, [filteredTransactions, pdfReportType]);

  const renderContent = () => {
    if (currentView === 'dashboard') {
      return (
        <>
          {transactions.length > 0 ? (
            <>
              <div className="flex flex-col lg:flex-row justify-between items-start gap-6 mb-8 print-hidden">
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-black text-slate-900">Gestor Financeiro</h2>
                  <p className="text-sm text-slate-500 font-medium">Análise consolidada e filtros avançados</p>
                </div>
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 w-full lg:w-auto">
                  <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm w-full sm:w-auto justify-end">
                    <div className="flex items-center gap-2 px-2">
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-[10px] font-black bg-indigo-50 text-indigo-700 border-none rounded-lg px-2 py-1 outline-none" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">até</span>
                      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-[10px] font-black bg-indigo-50 text-indigo-700 border-none rounded-lg px-2 py-1 outline-none" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm w-full sm:w-auto justify-end">
                    <select className="pl-3 pr-8 py-1.5 rounded-xl text-[10px] font-black uppercase appearance-none bg-transparent outline-none cursor-pointer text-slate-700" value={selectedCnpj || ""} onChange={(e) => setSelectedCnpj(e.target.value || null)}>
                      <option value="">Grupo Capital Dois</option>
                      {registeredCompanies.map(c => <option key={c.cnpj} value={c.cnpj}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="space-y-10 print-hidden">
                <Dashboard transactions={filteredTransactions} selectedCnpj={selectedCnpj} logoUrl={logoUrl} onLogoChange={setLogoUrl} />
                <TransactionTable transactions={filteredTransactions} allTransactions={transactions} onUpdateTransaction={handleUpdateTransaction} selectedCnpj={selectedCnpj} columnFilters={columnFilters} onColumnFilterChange={handleColumnFilterChange} />
              </div>
            </>
          ) : (
            <div className="text-center py-32 bg-white rounded-[3rem] border border-slate-100 shadow-sm print-hidden">
              <div className="max-w-md mx-auto px-6">
                <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-10">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Sem dados para exibir</h2>
                <button onClick={() => setCurrentView('import')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-indigo-100 text-sm uppercase tracking-widest">Ir para Importação</button>
              </div>
            </div>
          )}
        </>
      );
    }
    if (currentView === 'import') {
      return (
        <div className="max-w-4xl mx-auto print-hidden">
          <div className="flex flex-col gap-1 mb-8"><h2 className="text-2xl font-black text-slate-900">Importação de Extratos</h2></div>
          {isLoading ? (
            <div className="mb-12 flex flex-col items-center justify-center p-20 bg-white rounded-[3rem] border border-slate-100 shadow-xl shadow-indigo-50/50">
              <div className="relative mb-8"><div className="w-16 h-16 border-4 border-indigo-100 rounded-full"></div><div className="absolute inset-0 w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
              <h3 className="text-xl font-black text-slate-900">Processando...</h3>
            </div>
          ) : (
            <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
              <label className="cursor-pointer bg-slate-900 hover:bg-black text-white font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-slate-200 inline-flex items-center gap-3 text-sm uppercase tracking-widest">Escolher Arquivos<input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} multiple /></label>
            </div>
          )}
        </div>
      );
    }
    if (currentView === 'companies') {
      return (
        <div className="bg-white p-12 rounded-[3rem] border border-slate-100 print-hidden">
          <div className="flex justify-between items-center mb-12">
            <h2 className="text-2xl font-black text-slate-900">Empresas</h2>
            <button onClick={() => setIsAddingCompany(true)} className="bg-indigo-600 text-white font-black px-6 py-3 rounded-xl text-xs uppercase tracking-widest">Cadastrar</button>
          </div>
          {isAddingCompany && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-md">
                <h3 className="text-2xl font-black mb-6">Nova Empresa</h3>
                <form onSubmit={handleAddCompany} className="space-y-4">
                  <input required placeholder="Nome" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} className="w-full px-5 py-3 bg-slate-50 border rounded-2xl text-xs font-bold" />
                  <input required placeholder="CNPJ" value={newCompanyCnpj} onChange={e => setNewCompanyCnpj(e.target.value)} className="w-full px-5 py-3 bg-slate-50 border rounded-2xl text-xs font-bold" />
                  <div className="flex gap-3 pt-6">
                    <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest">Salvar</button>
                    <button type="button" onClick={() => setIsAddingCompany(false)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest">Cancelar</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {registeredCompanies.map(c => (
              <div key={c.cnpj} className="p-8 bg-slate-50 rounded-[2rem] border group">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Ativa</p>
                  <button onClick={() => editingCnpj === c.cnpj ? saveCompanyEdit(c.cnpj) : startEditCompany(c.cnpj, c.name)} className="text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-indigo-600">{editingCnpj === c.cnpj ? 'Salvar' : 'Editar'}</button>
                </div>
                {editingCnpj === c.cnpj ? <input className="w-full border rounded-lg px-2 py-1.5 text-sm font-black mb-2" value={editNameValue} onChange={e => setEditNameValue(e.target.value)} /> : <h3 className="font-black text-slate-900 text-xl leading-tight mb-1">{c.name}</h3>}
                <p className="text-xs text-slate-400 font-mono">{c.cnpj}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm h-16 flex items-center print-hidden">
          <div className="w-full max-w-[1400px] mx-auto px-4 flex justify-between items-center">
            <div className="flex-1">
              {currentView === 'dashboard' && <input type="text" placeholder="Busca global..." className="block w-64 pl-4 pr-4 py-2 bg-slate-50 border rounded-xl text-xs outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />}
            </div>
            <div className="flex items-center gap-3">
              {currentView === 'dashboard' && transactions.length > 0 && (
                <>
                  <button onClick={handleDownloadPDF} className="bg-white border text-slate-600 px-4 py-2 rounded-xl text-sm font-bold">Baixar PDF</button>
                  <button onClick={handleFinalizeDay} className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100">Finalizar Dia</button>
                  <button onClick={handleTriggerDeploy} className="bg-slate-900 hover:bg-black text-white px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    Deploy Render
                  </button>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 pt-8">
          {renderContent()}
          <div id="report-print-area">
             <div style={{ marginBottom: '30px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
                <h1 style={{ margin: 0, fontSize: '20pt', fontWeight: 'bold' }}>RELATÓRIO FINANCEIRO</h1>
                <p>{selectedCnpj ? 'Empresa Selecionada' : 'Consolidado'}</p>
             </div>
             <table>
                <thead><tr><th>Data</th><th>Valor</th><th>Origem</th><th>Notas</th></tr></thead>
                <tbody>{reportTransactions.map(t => <tr key={t.id}><td>{t.date.split('T')[0]}</td><td>{t.amount.toLocaleString('pt-BR')}</td><td>{t.origin}</td><td>{t.notes}</td></tr>)}</tbody>
             </table>
          </div>
        </main>
        {isPdfModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-sm">
               <h3 className="text-2xl font-black mb-8">Exportar Relatório</h3>
               <div className="space-y-3">
                  <button onClick={() => generateReport(TransactionType.OUTFLOW)} className="w-full py-4 px-6 bg-rose-50 text-rose-700 rounded-2xl font-black text-xs uppercase tracking-widest text-left">PDF Saídas</button>
                  <button onClick={() => generateReport(TransactionType.INFLOW)} className="w-full py-4 px-6 bg-emerald-50 text-emerald-700 rounded-2xl font-black text-xs uppercase tracking-widest text-left">PDF Entradas</button>
                  <button onClick={() => generateReport('all')} className="w-full py-4 px-6 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest text-left">PDF Geral</button>
               </div>
               <button onClick={() => setIsPdfModalOpen(false)} className="w-full mt-6 text-slate-400 font-bold text-[10px] uppercase tracking-widest">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
