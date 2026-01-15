
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
  doc, 
  query, 
  where,
  setDoc
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
        // Load Transactions
        const transSnapshot = await getDocs(collection(db, "transactions"));
        const transList = transSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        })) as Transaction[];
        setTransactions(transList);

        // Load Companies
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

  // Sync registered companies from transactions whenever they change (Auto-discovery)
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

    // Filter by Company (Top filter)
    if (selectedCnpj) {
      result = result.filter(t => t.ownerCnpj === selectedCnpj);
    }

    // Filter by Manual Date Range
    result = result.filter(t => {
      const tDatePart = t.date.split('T')[0];
      if (startDate && tDatePart < startDate) return false;
      if (endDate && tDatePart > endDate) return false;
      return true;
    });

    // Filter by Search Term (Global)
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

    // Apply Column Filters
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
                
                // STRICT DUPLICATE DETECTION logic:
                const isDuplicatedFile = result.transactions.length > 0 && result.transactions.every(newT => 
                  currentTransactions.some(existingT => 
                    existingT.date === newT.date && 
                    existingT.ownerBank === newT.ownerBank && 
                    existingT.amount === newT.amount
                  )
                );

                if (isDuplicatedFile) {
                  alert(`PDF em duplicidade interrompido: O arquivo '${file.name}' possui a mesma data, hora, minutos, segundos, banco e valores exatamente iguais aos dados já presentes no Gestor Financeiro.`);
                  resolve();
                  return;
                }

                // Save to Firestore
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
        // Clear transactions in Firestore
        const transSnapshot = await getDocs(collection(db, "transactions"));
        for (const d of transSnapshot.docs) {
          await deleteDoc(doc(db, "transactions", d.id));
        }
        
        // Clear companies in Firestore
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
        
        // Calcula Totais
        const summary = filteredTransactions.reduce((acc, t) => {
          if (t.type === TransactionType.INFLOW) acc.totalInflow += t.amount;
          else acc.totalOutflow += t.amount;
          return acc;
        }, { totalInflow: 0, totalOutflow: 0 });

        // Calcula Métodos de Pagamento
        const paymentMethods: Record<string, number> = {};
        filteredTransactions.forEach(t => {
          paymentMethods[t.paymentMethod] = (paymentMethods[t.paymentMethod] || 0) + 1;
        });

        // Calcula Evolução no Filtro (Timeline)
        const evolution: Record<string, { inflow: number, outflow: number }> = {};
        filteredTransactions.forEach(t => {
          const day = t.date.split('T')[0];
          if (!evolution[day]) evolution[day] = { inflow: 0, outflow: 0 };
          if (t.type === TransactionType.INFLOW) evolution[day].inflow += t.amount;
          else evolution[day].outflow += t.amount;
        });

        // Monta objeto para salvar
        const dashboardData = {
          timestamp: new Date().toISOString(),
          ownerCnpj: selectedCnpj || "consolidado",
          ownerName: selectedCnpj ? (transactions.find(t => t.ownerCnpj === selectedCnpj)?.ownerName || "Empresa") : "Grupo Capital Dois",
          entradas: summary.totalInflow,
          saidas: summary.totalOutflow,
          saldoLiquido: summary.totalInflow - summary.totalOutflow,
          metodosPagamento: paymentMethods,
          evolucaoNoFiltro: evolution,
          filtrosAplicados: {
            startDate,
            endDate,
            searchTerm,
            columnFilters
          }
        };

        // Salva na coleção Dashboard
        await addDoc(collection(db, "Dashboard"), dashboardData);
        
        alert("Dia finalizado com sucesso! Todos os dados de Entradas, Saídas, Saldo, Métodos e Evolução foram salvos na coleção Dashboard.");
      } catch (err) {
        console.error("Erro ao salvar no Dashboard:", err);
        alert("Ocorreu um erro ao tentar salvar os dados no Dashboard.");
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
    // Timeout pequeno para garantir que o estado do React atualizou a div oculta antes do print
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
      console.error("Erro ao adicionar empresa no Firebase:", err);
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
          c.cnpj === cnpj 
            ? { ...c, alternativeNames: updatedAltNames } 
            : c
        ));
      } catch (err) {
        console.error("Erro ao adicionar nomenclatura alternativa no Firebase:", err);
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

    const updates = { 
      name: editNameValue, 
      originalName: company.originalName || company.name 
    };

    try {
      await updateDoc(doc(db, "companies", company.id), updates);
      
      const updatedCompanies = registeredCompanies.map(c => {
        if (c.cnpj === cnpj) {
          return { ...c, ...updates };
        }
        return c;
      });

      setRegisteredCompanies(updatedCompanies);
      
      // Bulk update transactions for this company
      const companyTrans = transactions.filter(t => t.ownerCnpj === cnpj);
      for (const t of companyTrans) {
        if (t.id) {
          await updateDoc(doc(db, "transactions", t.id), { ownerName: editNameValue });
        }
      }

      setTransactions(prev => prev.map(t => 
        t.ownerCnpj === cnpj ? { ...t, ownerName: editNameValue } : t
      ));
      setEditingCnpj(null);
    } catch (err) {
      console.error("Erro ao salvar edição da empresa no Firebase:", err);
    }
  };

  // Filtrar transações para o relatório PDF
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
                      <input 
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="text-[10px] font-black bg-indigo-50 text-indigo-700 border-none rounded-lg px-2 py-1 outline-none"
                      />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">até</span>
                      <input 
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="text-[10px] font-black bg-indigo-50 text-indigo-700 border-none rounded-lg px-2 py-1 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm w-full sm:w-auto justify-end">
                    <select 
                      className="pl-3 pr-8 py-1.5 rounded-xl text-[10px] font-black uppercase appearance-none bg-transparent outline-none cursor-pointer text-slate-700"
                      value={selectedCnpj || ""}
                      onChange={(e) => setSelectedCnpj(e.target.value || null)}
                    >
                      <option value="">Grupo Capital Dois</option>
                      {registeredCompanies.map(c => (
                        <option key={c.cnpj} value={c.cnpj}>{c.name}</option>
                      ))}
                    </select>
                    <div className="absolute -mr-8 mt-0 pointer-events-none pr-3">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                       </svg>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-10 print-hidden">
                <Dashboard 
                  transactions={filteredTransactions} 
                  selectedCnpj={selectedCnpj}
                  logoUrl={logoUrl}
                  onLogoChange={setLogoUrl}
                />
                <TransactionTable 
                  transactions={filteredTransactions}
                  allTransactions={transactions}
                  onUpdateTransaction={handleUpdateTransaction} 
                  selectedCnpj={selectedCnpj}
                  columnFilters={columnFilters}
                  onColumnFilterChange={handleColumnFilterChange}
                />
              </div>

              {filteredTransactions.length === 0 && (
                <div className="text-center py-20 bg-white rounded-[2rem] border border-slate-100 shadow-sm print-hidden">
                  <p className="text-slate-400 text-sm font-black uppercase tracking-widest">Nenhum resultado encontrado</p>
                  <p className="text-slate-500 mt-2 font-medium">Ajuste seus filtros ou termos de busca.</p>
                  <button 
                    onClick={() => { 
                      setStartDate('');
                      setEndDate('');
                      setSelectedCnpj(null); 
                      setSearchTerm(''); 
                      setColumnFilters({
                        date: '', ownerName: '', payingBank: '', type: '', 
                        origin: '', counterpartyName: '', amount: '', notes: ''
                      });
                    }}
                    className="mt-6 text-indigo-600 text-xs font-black uppercase tracking-widest hover:underline"
                  >
                    Resetar Tudo
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-32 bg-white rounded-[3rem] border border-slate-100 shadow-sm print-hidden">
              <div className="max-w-md mx-auto px-6">
                <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-10">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Sem dados para exibir</h2>
                <p className="text-slate-500 font-medium mb-10 text-lg leading-relaxed">
                  Não existem transações importadas no sistema. Por favor, vá para a aba de Importação para carregar seus extratos bancários.
                </p>
                <button 
                  onClick={() => setCurrentView('import')}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-indigo-100 text-sm uppercase tracking-widest"
                >
                  Ir para Importação
                </button>
              </div>
            </div>
          )}
        </>
      );
    }

    if (currentView === 'import') {
      return (
        <div className="max-w-4xl mx-auto print-hidden">
          <div className="flex flex-col gap-1 mb-8">
            <h2 className="text-2xl font-black text-slate-900">Importação de Extratos</h2>
            <p className="text-sm text-slate-500 font-medium">Carregue arquivos PDF ou imagens para análise via IA</p>
          </div>

          {isLoading && (
            <div className="mb-12 flex flex-col items-center justify-center p-20 bg-white rounded-[3rem] border border-slate-100 shadow-xl shadow-indigo-50/50">
              <div className="relative mb-8">
                <div className="w-16 h-16 border-4 border-indigo-100 rounded-full"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Processando seus dados</h3>
              <p className="text-slate-500 text-center max-w-xs font-medium">Estamos usando IA para extrair e organizar as transações dos seus extratos.</p>
            </div>
          )}

          {error && (
            <div className="mb-8 p-5 bg-rose-50 text-rose-700 rounded-2xl border border-rose-100 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="font-black uppercase text-[10px] tracking-widest mb-0.5">Erro detectado</p>
                <span className="text-sm font-bold">{error}</span>
              </div>
            </div>
          )}

          {!isLoading && (
            <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 shadow-sm">
              <div className="max-w-md mx-auto px-6">
                <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-10 shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Importar Novos Arquivos</h2>
                <p className="text-slate-500 font-medium mb-10 text-lg leading-relaxed">
                  Selecione arquivos PDF ou imagens de extratos bancários. 
                  Nossa IA fará o trabalho pesado de organização para você.
                </p>
                <label className="cursor-pointer bg-slate-900 hover:bg-black text-white font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-slate-200 inline-flex items-center gap-3 active:scale-95 text-sm uppercase tracking-widest">
                  Escolher Arquivos
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*,application/pdf" 
                    onChange={handleFileUpload}
                    multiple
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (currentView === 'companies') {
      return (
        <div className="bg-white p-12 rounded-[3rem] border border-slate-100 print-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-black text-slate-900">Empresas Cadastradas</h2>
              <p className="text-sm text-slate-500 font-medium">Você tem {registeredCompanies.length} empresas no sistema.</p>
            </div>
            
            <button 
              onClick={() => setIsAddingCompany(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 text-xs uppercase tracking-widest active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Cadastrar Nova Empresa
            </button>

            {/* Company Registration Modal Pop-up */}
            {isAddingCompany && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
                  <h3 className="text-2xl font-black text-slate-900 mb-6 tracking-tight">Nova Empresa</h3>
                  <form onSubmit={handleAddCompany} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nome da Empresa</label>
                      <input 
                        autoFocus
                        required
                        placeholder="Ex: Grupo Capital Dois"
                        value={newCompanyName}
                        onChange={e => setNewCompanyName(e.target.value)}
                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">CNPJ</label>
                      <input 
                        required
                        placeholder="00.000.000/0000-00"
                        value={newCompanyCnpj}
                        onChange={e => setNewCompanyCnpj(e.target.value)}
                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Esse CNPJ possui outra nomenclatura?</label>
                      <input 
                        placeholder="Ex: Nome Fantasia Secundário"
                        value={newCompanyAltName}
                        onChange={e => setNewCompanyAltName(e.target.value)}
                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                      />
                    </div>
                    <div className="flex gap-3 pt-6">
                      <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-100 active:scale-95">Salvar Empresa</button>
                      <button type="button" onClick={() => setIsAddingCompany(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95">Cancelar</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {registeredCompanies.map(c => (
              <div key={c.cnpj} className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 text-left transition-all hover:shadow-xl hover:shadow-slate-100 group flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Empresa Ativa</p>
                  
                  {editingCnpj === c.cnpj ? (
                    <button 
                      onClick={() => saveCompanyEdit(c.cnpj)}
                      className="text-emerald-600 font-black text-[10px] uppercase tracking-widest hover:underline"
                    >
                      Salvar
                    </button>
                  ) : (
                    <button 
                      onClick={() => startEditCompany(c.cnpj, c.name)}
                      className="text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Editar
                    </button>
                  )}
                </div>

                {editingCnpj === c.cnpj ? (
                  <input 
                    autoFocus
                    className="w-full bg-white border border-indigo-400 rounded-lg px-2 py-1.5 text-sm font-black text-slate-900 outline-none mb-2"
                    value={editNameValue}
                    onChange={e => setEditNameValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveCompanyEdit(c.cnpj)}
                  />
                ) : (
                  <h3 className="font-black text-slate-900 text-xl leading-tight mb-1">{c.name}</h3>
                )}

                {c.originalName && c.originalName !== c.name && (
                  <p className="text-xs text-slate-300 font-bold italic mb-3">Anteriormente: {c.originalName}</p>
                )}

                <p className="text-xs text-slate-400 font-mono tracking-tighter mt-1 flex items-center gap-2">
                   <span className="w-1.5 h-1.5 bg-slate-200 rounded-full"></span>
                   {c.cnpj}
                </p>

                <div className="mt-4 pt-4 border-t border-slate-100 flex-1">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Outras Nomenclaturas</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {c.alternativeNames?.map((alt, idx) => (
                      <span key={idx} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[9px] font-bold">
                        {alt}
                      </span>
                    ))}
                    {(!c.alternativeNames || c.alternativeNames.length === 0) && (
                      <span className="text-[9px] text-slate-300 font-bold uppercase italic">Nenhuma</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      placeholder="Esse CNPJ possui outra nomenclatura?"
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value;
                          handleAddAltName(c.cnpj, val);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (currentView === 'users') {
      return (
        <div className="bg-white p-12 rounded-[3rem] border border-slate-100 text-center print-hidden">
          <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Controle de Usuários</h2>
          <p className="text-slate-500 font-medium">Gerencie quem tem acesso à plataforma FlowState.</p>
          <div className="mt-8 p-8 bg-slate-50 rounded-2xl border border-slate-100 text-left max-w-lg mx-auto">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black">JD</div>
               <div>
                 <p className="font-black text-slate-900">John Doe</p>
                 <p className="text-xs text-slate-500">Administrador Master</p>
               </div>
               <span className="ml-auto px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-[10px] font-black uppercase">Ativo</span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <div className="print-hidden">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm h-16 flex items-center print-hidden">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
            <div className="flex-1">
              {transactions.length > 0 && currentView === 'dashboard' && (
                <div className="relative group max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Busca global em transações..."
                    className="block w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {transactions.length > 0 && currentView === 'dashboard' && (
                <>
                  <button 
                    onClick={handleDownloadPDF}
                    className="bg-white hover:bg-slate-50 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 transition-all flex items-center gap-2 active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Baixar PDF
                  </button>
                  <button
                    onClick={handleFinalizeDay}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Finalizar o Dia
                  </button>
                </>
              )}
              {transactions.length > 0 && currentView !== 'dashboard' && (
                <button 
                  onClick={clearAllData}
                  className="bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 p-2 rounded-xl border border-slate-200 transition-all active:scale-95"
                  title="Limpar todos os dados"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          {renderContent()}
          
          {/* AREA DE IMPRESSÃO OCULTA */}
          <div id="report-print-area">
             <div style={{ marginBottom: '30px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
                <h1 style={{ margin: 0, fontSize: '20pt', fontWeight: 'bold' }}>RELATÓRIO FINANCEIRO</h1>
                <p style={{ margin: '5px 0', fontSize: '12pt', color: '#666' }}>
                  {pdfReportType === 'all' ? 'Extrato Geral' : pdfReportType === TransactionType.INFLOW ? 'Relatório de Entradas' : 'Relatório de Saídas'}
                </p>
                <p style={{ margin: '5px 0', fontSize: '10pt' }}>Empresa: {selectedCnpj ? transactions.find(t => t.ownerCnpj === selectedCnpj)?.ownerName : 'Grupo Capital Dois'}</p>
                <p style={{ margin: '5px 0', fontSize: '10pt' }}>Data de Emissão: {new Date().toLocaleDateString('pt-BR')}</p>
             </div>

             <table>
                <thead>
                   <tr>
                      <th>Data</th>
                      <th>Valor (R$)</th>
                      <th>Origem</th>
                      <th>Observações</th>
                   </tr>
                </thead>
                <tbody>
                   {reportTransactions.map(t => (
                      <tr key={t.id}>
                         <td>{t.date.split('T')[0].split('-').reverse().join('/')}</td>
                         <td style={{ fontWeight: 'bold', color: t.type === TransactionType.INFLOW ? '#059669' : '#e11d48' }}>
                            {t.type === TransactionType.OUTFLOW ? '-' : ''} {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                         </td>
                         <td>{t.origin}</td>
                         <td style={{ fontStyle: 'italic', color: '#64748b' }}>{t.notes || '-'}</td>
                      </tr>
                   ))}
                </tbody>
             </table>

             <div style={{ marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '10px', textAlign: 'right' }}>
                <p style={{ fontSize: '12pt', fontWeight: 'bold' }}>
                   Total do Período: R$ {reportTransactions.reduce((acc, t) => acc + (t.type === TransactionType.INFLOW ? t.amount : -t.amount), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
             </div>
          </div>
        </main>

        <footer className="mt-auto border-t border-slate-100 py-8 print-hidden">
          <div className="max-w-[1400px] mx-auto px-4 text-center">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              © {new Date().getFullYear()} FlowState AI System • Professional Financial Intelligence
            </p>
          </div>
        </footer>
      </div>

      {/* Pop-up de Seleção do PDF */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-sm shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
             <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                   </svg>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Exportar Relatório</h3>
                <p className="text-sm text-slate-500 font-medium mt-2">Selecione o tipo de PDF que deseja gerar.</p>
             </div>

             <div className="space-y-3">
                <button 
                  onClick={() => generateReport(TransactionType.OUTFLOW)}
                  className="w-full py-4 px-6 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-2xl font-black text-xs uppercase tracking-widest transition-all text-left flex items-center justify-between group"
                >
                   PDF de Saídas
                   <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </button>
                <button 
                  onClick={() => generateReport(TransactionType.INFLOW)}
                  className="w-full py-4 px-6 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-2xl font-black text-xs uppercase tracking-widest transition-all text-left flex items-center justify-between group"
                >
                   PDF de Entradas
                   <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </button>
                <button 
                  onClick={() => generateReport('all')}
                  className="w-full py-4 px-6 bg-slate-900 text-white hover:bg-black rounded-2xl font-black text-xs uppercase tracking-widest transition-all text-left flex items-center justify-between group"
                >
                   PDF Geral
                   <span className="opacity-40 group-hover:opacity-100 transition-opacity">→</span>
                </button>
             </div>

             <button 
               onClick={() => setIsPdfModalOpen(false)}
               className="w-full mt-6 py-3 text-slate-400 hover:text-slate-600 font-bold text-[10px] uppercase tracking-widest"
             >
                Cancelar
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
