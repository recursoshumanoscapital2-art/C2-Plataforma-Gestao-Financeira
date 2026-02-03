
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Transaction, TransactionType, PaymentMethod } from './types';
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
  doc,
  deleteDoc,
  onSnapshot
} from "firebase/firestore";

// The environment provides global types for window.aistudio and AIStudio.
// Local declarations are removed to avoid duplicate identifier and modifier conflicts.

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
  name: string;
  login: string;
  email: string;
  password?: string;
  role: 'admin' | 'comum';
  active: boolean;
}

const PrintLayout = ({ reportData, companyInfo, logoUrl, dateRange, registeredCompanies }: { 
  reportData: { title: string; data: Transaction[]; type: 'inflow' | 'outflow' | 'all' }, 
  companyInfo: any, 
  logoUrl: string | null, 
  dateRange: { start: string, end: string },
  registeredCompanies: CompanyInfo[]
}) => {
  // Helper to format currency consistently and avoid toLocaleString argument issues
  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  // Helper local para resolver o nome canônico/principal da empresa para agrupamento no PDF
  const getCanonicalName = (name: string, cnpj: string) => {
    // Normalização agressiva para garantir que variações como "C2r Gestao..." e "C2R GEST..." batam sempre
    const normalize = (s: string) => {
      if (!s) return "";
      return s.toLowerCase()
        .trim()
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .replace(/ ltda$/i, '')
        .replace(/ s\/a$/i, '')
        .replace(/ sa$/i, '')
        .replace(/ me$/i, '')
        .replace(/ eireli$/i, '');
    };

    const normName = normalize(name);
    const cleanCnpj = (cnpj || '').replace(/\D/g, '');
    
    const found = registeredCompanies.find(c => {
       const cCnpj = (c.cnpj || '').replace(/\D/g, '');
       return (cleanCnpj && cleanCnpj === cCnpj) || 
              normalize(c.name) === normName || 
              c.alternativeNames?.some(alt => normalize(alt) === normName);
    });
    
    return found ? found.name : name;
  };

  // Fix: Explicitly type the accumulator in reduce to avoid 'unknown' type errors for summary properties.
  const summary = useMemo(() => {
    return reportData.data.reduce((acc, t) => {
      const val = Math.abs(t.amount);
      if (t.type === TransactionType.INFLOW) acc.totalInflow += val;
      else if (t.type === TransactionType.OUTFLOW) acc.totalOutflow += val;
      else if (t.type === TransactionType.MANUAL) acc.totalManual += t.amount;
      return acc;
    }, { totalInflow: 0, totalOutflow: 0, totalManual: 0 } as { totalInflow: number; totalOutflow: number; totalManual: number });
  }, [reportData.data]);

  const companySummaries = useMemo(() => {
    const groups: Record<string, {
      name: string;
      total: number;
      banks: Record<string, number>;
    }> = {};

    reportData.data.forEach(t => {
      // Usa o nome canônico para garantir que variações de nomes alternativos agrupem no mesmo card
      const targetName = getCanonicalName(t.ownerName, t.ownerCnpj);
      const compKey = targetName.trim().toUpperCase();
      
      // Para o resumo da empresa no PDF, usamos sempre o ownerBank (o seu banco).
      const bank = t.ownerBank;
      
      if (!groups[compKey]) {
        groups[compKey] = { name: targetName, total: 0, banks: {} };
      }

      // FIX: Garantimos o valor absoluto para Inflow/Outflow para evitar erro de sinal se o dado vier negativo do banco de dados
      const absVal = Math.abs(t.amount);
      let effect = 0;
      
      if (t.type === TransactionType.INFLOW) {
        effect = absVal;
      } else if (t.type === TransactionType.OUTFLOW) {
        effect = -absVal; // Sempre subtrai a saída
      } else if (t.type === TransactionType.MANUAL) {
        effect = t.amount; // Saldo manual mantém o sinal original (pode ser ajuste negativo)
      }

      groups[compKey].total += effect;
      groups[compKey].banks[bank] = (groups[compKey].banks[bank] || 0) + effect;
    });

    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [reportData.data, registeredCompanies]);

  // Saldo Líquido Geral: Saldo Manual + Entradas - Saídas
  const balance: number = (summary.totalManual as number) + (summary.totalInflow as number) - (summary.totalOutflow as number);

  return (
    <div id="report-print-area">
      <header className="report-header">
        <div className="flex items-center gap-4">
          {logoUrl && <img src={logoUrl} alt="Logo da Empresa" />}
          <div>
            <h1 className="text-xl font-bold">{companyInfo.name}</h1>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{companyInfo.cnpj}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold">{reportData.title}</h2>
          <p className="text-[9px] text-slate-500 font-bold">
            {dateRange.start ? new Date(dateRange.start + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início'} a {dateRange.end ? new Date(dateRange.end + 'T00:00:00').toLocaleDateString('pt-BR') : 'Fim'}
          </p>
        </div>
      </header>
      
      <main>
        <section className="report-summary">
          {(reportData.type === 'inflow' || reportData.type === 'all') && (
            <div className="summary-card" style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
              <p>Total de Entradas</p>
              <h3 style={{ color: '#166534' }}>R$ {formatCurrency(summary.totalInflow)}</h3>
            </div>
          )}
          {(reportData.type === 'outflow' || reportData.type === 'all') && (
            <div className="summary-card" style={{ backgroundColor: '#fff1f2', borderColor: '#fecdd3' }}>
              <p>Total de Saídas</p>
              <h3 style={{ color: '#9f1239' }}>R$ {formatCurrency(summary.totalOutflow)}</h3>
            </div>
          )}
          {reportData.type === 'all' && (
            <div className="summary-card" style={{ backgroundColor: balance >= 0 ? '#f0f9ff' : '#bae6fd', borderColor: balance >= 0 ? '#bae6fd' : '#fecdd3' }}>
              <p>Saldo Líquido Geral</p>
              <h3 style={{ color: balance >= 0 ? '#0369a1' : '#9f1239' }}>R$ {formatCurrency(balance)}</h3>
            </div>
          )}
        </section>

        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Empresa</th>
              <th>Banco</th>
              <th>Origem</th>
              {(reportData.type === 'outflow' || reportData.type === 'all' || reportData.type === 'inflow') && <th>Favorecido</th>}
              <th style={{ textAlign: 'right' }}>Valor (R$)</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            {reportData.data.map(t => (
              <tr key={t.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                <td>{getCanonicalName(t.ownerName, t.ownerCnpj)}</td>
                <td>{t.type === TransactionType.INFLOW ? t.payingBank : t.ownerBank}</td>
                <td>{t.origin}</td>
                <td>{t.counterpartyName || '-'}</td>
                <td style={{ 
                  textAlign: 'right', 
                  fontWeight: 700, 
                  color: t.type === TransactionType.INFLOW ? '#15803d' : 
                         t.type === TransactionType.OUTFLOW ? '#be123c' : '#4f46e5' 
                }}>
                  {t.type === TransactionType.OUTFLOW ? '-' : ''}{formatCurrency(Math.abs(t.amount))}
                </td>
                <td style={{ fontSize: '7pt', color: '#64748b' }}>{t.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {reportData.type === 'all' && (
          <section className="report-company-summaries" style={{ marginTop: '30px' }}>
            <h3 style={{ fontSize: '12pt', fontWeight: 800, marginBottom: '15px', color: '#1e293b', borderLeft: '4px solid #4f46e5', paddingLeft: '10px' }}>
              RESUMO DE SALDO LÍQUIDO POR EMPRESA
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
              {companySummaries.map(group => (
                <div key={group.name} className="company-summary-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '15px', backgroundColor: '#f8fafc' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <p style={{ fontSize: '7pt', color: '#64748b', fontWeight: 800, margin: '0 0 2px 0', textTransform: 'uppercase' }}>Empresa</p>
                    <h4 style={{ fontSize: '10pt', fontWeight: 800, margin: 0, color: '#0f172a' }}>{group.name}</h4>
                  </div>
                  <div style={{ borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px', marginBottom: '10px' }}>
                    <p style={{ fontSize: '7pt', color: '#64748b', fontWeight: 800, margin: '0 0 2px 0', textTransform: 'uppercase' }}>Saldo Líquido no Período</p>
                    <p style={{ fontSize: '13pt', fontWeight: 900, margin: 0, color: group.total >= 0 ? '#15803d' : '#be123c' }}>
                      R$ {formatCurrency(group.total)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '7pt', color: '#64748b', fontWeight: 800, margin: '0 0 5px 0', textTransform: 'uppercase' }}>Detalhes por Banco</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {Object.entries(group.banks).map(([bank, bal]) => (
                        <div key={bank} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5pt', padding: '2px 0' }}>
                          <span style={{ color: '#475569', fontWeight: 600 }}>{bank}</span>
                          <span style={{ fontWeight: 800, color: (bal as number) >= 0 ? '#166534' : '#9f1239' }}>
                            R$ {formatCurrency(bal as number)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="report-footer">
        Relatório emitido em {new Date().toLocaleString('pt-BR')} • C2 Gestao Financeira
      </footer>
    </div>
  );
};


const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('isAuthenticated') === 'true');
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(() => {
    const storedUser = sessionStorage.getItem('currentUser');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const navigate = useNavigate();
  const location = useLocation();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history'>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null);
  const [hasPaidApiKey, setHasPaidApiKey] = useState(false);
  
  const [registeredCompanies, setRegisteredCompanies] = useState<CompanyInfo[]>([]);
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCnpj, setNewCompanyCnpj] = useState('');
  const [newCompanyAltNames, setNewCompanyAltNames] = useState<string[]>([]);
  const [showAddAltNames, setShowAddAltNames] = useState(false);

  // Manual Balance Modal States
  const [isManualBalanceModalOpen, setIsManualBalanceModalOpen] = useState(false);
  const [manualBalanceValue, setManualBalanceValue] = useState<string>('');
  const [manualBalanceDate, setManualBalanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [manualBalanceCompanyCnpj, setManualBalanceCompanyCnpj] = useState<string>('');
  const [manualBalanceBank, setManualBalanceBank] = useState<string>('');
  
  const manualBalanceBanks = ["Banco Inter", "Santander", "Itaú", "Cora", "Banco Daycoval", "Banco do Brasil", "Banco BMG", "BANCO MERCANTIL", "C6 Bank"];

  const [editingCnpj, setEditingCnpj] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editCnpjValue, setEditCnpjValue] = useState('');
  const [editAltNameValue, setEditAltNameValue] = useState<string[]>([]);
  const [showEditAltNames, setShowEditAltNames] = useState(false);

  const [usersList, setUsersList] = useState<UserInfo[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
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
  
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    date: '', ownerName: '', payingBank: '', type: '', origin: '', counterpartyName: '', amount: '', notes: ''
  });

  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isGroupFilterModalOpen, setIsGroupFilterModalOpen] = useState(false);
  const [pendingReportType, setPendingReportType] = useState<'inflow' | 'outflow' | 'all' | null>(null);
  const [reportDataForPrint, setReportDataForPrint] = useState<{ title: string; data: Transaction[]; type: 'inflow' | 'outflow' | 'all' } | null>(null);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const interruptRef = useRef(false);

  const uniqueCompanies = useMemo(() => {
    return registeredCompanies.filter(c => !c.hidden);
  }, [registeredCompanies]);

  useEffect(() => {
    const checkApiKey = async () => {
      // @ts-ignore: aistudio is assumed to be globally available in the environment
      if (window.aistudio) {
        // @ts-ignore
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasPaidApiKey(hasKey);
      }
    };
    checkApiKey();
  }, []);

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
    if (!isAuthenticated) return;

    setIsLoading(true);

    // Listener em tempo real para as transações no Firebase
    const unsubscribeTrans = onSnapshot(collection(db, "transactions"), (snapshot) => {
      const transList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Transaction[];
      setTransactions(transList);
      setIsLoading(false);
      setIsDataLoaded(true);
    }, (err) => {
      console.error("Erro ao sincronizar transações:", err);
      setIsLoading(false);
    });

    const fetchData = async () => {
      try {
        const [compSnapshot, usersSnapshot] = await Promise.all([
          getDocs(collection(db, "companies")),
          getDocs(collection(db, "users"))
        ]);
        const compList = compSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as CompanyInfo[];
        setRegisteredCompanies(compList);
        // Fix: Corrected name from 'userDataSnapshot' to 'usersListData' and removed redundant code
        const usersListData = usersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as UserInfo[];
        setUsersList(usersListData);
      } catch (err) {
        console.error("Erro ao carregar dados do Firebase:", err);
      }
    };
    
    fetchData();

    return () => unsubscribeTrans();
  }, [isAuthenticated]);

  const handleOpenSelectKey = async () => {
    // @ts-ignore
    if (window.aistudio) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasPaidApiKey(true); // Assume sucesso após abrir
    }
  };

  const normalizedTransactions = useMemo(() => {
    const cnpjToCompanyMap = new Map<string, CompanyInfo>();
    const nameToCompanyMap = new Map<string, CompanyInfo>();

    // Lista fixa de nomes que forçam a origem para Transferencia entre Contas do Grupo
    const forceGroupNames = [
      "CAPITAL 2 SERVICOS",
      "FINX PROMOTORA DE VENDAS LTDA",
      "C2 INFORMACOES CADASTRAIS LTDA",
      "CAPITAL 2 GESTAO",
      "C2R GESTAO DE CORRESPONDENTES BANCARIOS",
      "R DE S BEZERRA INFORMACOES",
      "FLEXX A S NEGOCIOS LTDA",
      "RC INFORMACOES CADASTRAIS LTDA",
      "FLEXX",
      "TC",
      "C2 INFORMA"
    ].map(n => n.toLowerCase().trim().replace(/\./g, ''));

    registeredCompanies.forEach(c => {
      const cleanCnpj = c.cnpj ? c.cnpj.replace(/\D/g, '') : '';
      if (cleanCnpj) {
        cnpjToCompanyMap.set(cleanCnpj, c);
      }
      
      const normMain = c.name.toLowerCase().trim().replace(/\./g, '');
      nameToCompanyMap.set(normMain, c);
      
      c.alternativeNames?.forEach(alt => {
        nameToCompanyMap.set(alt.toLowerCase().trim().replace(/\./g, ''), c);
      });
    });

    const normalizeBank = (bank: string) => {
      if (!bank) return bank;
      const b = bank.trim();
      const lower = b.toLowerCase();
      if (lower === 'itau' || lower === 'itaú') return 'Itaú';
      return b;
    };

    return transactions.map(t => {
      const cleanTValCnpj = t.ownerCnpj ? t.ownerCnpj.replace(/\D/g, '') : '';
      const lowerTValName = t.ownerName ? t.ownerName.toLowerCase().trim() : '';

      const matchedCompany = cnpjToCompanyMap.get(cleanTValCnpj) || nameToCompanyMap.get(lowerTValName.replace(/\./g, ''));
      
      const finalName = matchedCompany ? matchedCompany.name : t.ownerName;
      const finalCnpj = matchedCompany ? (matchedCompany.cnpj || t.ownerCnpj) : t.ownerCnpj;

      // Lógica para forçar a origem do Grupo Capital Dois baseada em nomes ou prefixos específicos
      const partyNorm = (t.counterpartyName || '').toLowerCase().trim().replace(/\./g, '');
      const isGroupTransfer = 
        partyNorm.startsWith("capital 2") || 
        partyNorm.startsWith("c2r") || 
        partyNorm.startsWith("flexx") ||
        partyNorm.startsWith("tc") ||
        partyNorm.startsWith("c2 informa") ||
        forceGroupNames.some(groupName => partyNorm === groupName || partyNorm.startsWith(groupName)) || 
        nameToCompanyMap.has(partyNorm);

      // Nova lógica para Banco do Brasil: Invest. Resgate Autom. deve somar ao saldo (forçar como entrada)
      const isBBResgate = (t.payingBank?.toLowerCase().includes("brasil") || t.ownerBank?.toLowerCase().includes("brasil")) && 
                          t.description?.toLowerCase().includes("invest. resgate autom.");

      return { 
        ...t, 
        ownerName: finalName,
        ownerCnpj: finalCnpj,
        ownerBank: normalizeBank(t.ownerBank),
        payingBank: normalizeBank(t.payingBank),
        origin: isGroupTransfer ? "Transf. Contas Grupo" : t.origin,
        type: isBBResgate ? TransactionType.INFLOW : t.type
      };
    });
  }, [transactions, registeredCompanies]);

  const filteredTransactions = useMemo(() => {
    let result = [...normalizedTransactions];

    // O filtro global selectedCnpj e o filtro da coluna Empresa agora estão sincronizados pela mesma lógica de CNPJ
    if (selectedCnpj) {
      const targetCnpj = selectedCnpj.replace(/\D/g, '');
      result = result.filter(t => (t.ownerCnpj || '').replace(/\D/g, '') === targetCnpj);
    }

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
            const absVal = Math.abs(t.amount || 0);
            const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(absVal);
            const displayVal = (t.type === TransactionType.OUTFLOW ? '-' : '') + formatted;
            return displayVal.includes(filterValue);
          }
          if (key === 'date') return t.date ? t.date.split('T')[0].includes(value) : false;
          // ownerName já é tratado via selectedCnpj
          if (key === 'ownerName') return true; 
          const tValue = String(t[key as keyof Transaction] || '').toLowerCase();
          return tValue.includes(value);
        });
      }
    });
    return result.sort((a, b) => (a.date && b.date) ? new Date(b.date).getTime() - new Date(a.date).getTime() : 0);
  }, [normalizedTransactions, selectedCnpj, startDate, endDate, searchTerm, columnFilters]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setPendingFiles(Array.from(files));
  }, []);

  const handleConfirmImport = async () => {
    if (pendingFiles.length === 0) return;
    setIsLoading(true);
    setError(null);
    interruptRef.current = false;
    
    try {
      const allExtractedTransactions: any[] = [];
      
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        if (interruptRef.current) {
          throw new Error("Importação interrompida pelo usuário.");
        }
        
        // Atraso aumentado para evitar estouro de TPM (Tokens por Minuto)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result?.toString().split(',')[1] || "");
          reader.onerror = (e) => reject(new Error("Erro ao ler arquivo"));
          reader.readAsDataURL(file);
        });
        
        const result = await processStatement(base64, file.type);
        
        // Lógica de Identificação em Tempo Real no processamento
        const identifiedTransactions = result.transactions.map((t: any) => {
          const partyNameLower = (t.ownerName || '').toLowerCase().trim();
          const matchedCompany = registeredCompanies.find(c => 
            c.name.toLowerCase().trim() === partyNameLower ||
            c.alternativeNames?.some(alt => alt.toLowerCase().trim() === partyNameLower)
          );
          
          if (matchedCompany) {
            return {
              ...t,
              ownerName: matchedCompany.name, // Garante que salva com o nome principal
              ownerCnpj: matchedCompany.cnpj || t.ownerCnpj
            };
          }
          return t;
        });

        allExtractedTransactions.push(...identifiedTransactions);
      }

      if (interruptRef.current) {
        throw new Error("Importação interrompida antes do salvamento.");
      }

      // LÓGICA DE DESDUPLICAÇÃO
      // Filtramos transações que já existem no banco de dados ou que já foram extraídas no lote atual
      const uniqueToSave: Transaction[] = [];
      const cleanStr = (s: string) => (s || '').toLowerCase().trim();

      for (const newT of allExtractedTransactions) {
        const newDate = newT.date.split('T')[0];
        const newAmt = Math.abs(newT.amount).toFixed(2);
        const newBank = cleanStr(newT.ownerBank);
        const newType = newT.type;
        const newParty = cleanStr(newT.counterpartyName);

        // Verifica se existe duplicata no banco de dados (exatamente mesmos campos-chave)
        const isDuplicateInDb = transactions.some(ext => {
          const extDate = ext.date.split('T')[0];
          const extAmt = Math.abs(ext.amount).toFixed(2);
          const extBank = cleanStr(ext.ownerBank);
          const extType = ext.type;
          const extParty = cleanStr(ext.counterpartyName);

          return extDate === newDate && 
                 extAmt === newAmt && 
                 extBank === newBank && 
                 extType === newType && 
                 extParty === newParty;
        });

        // Verifica se existe duplicata já processada neste lote
        const isDuplicateInBatch = uniqueToSave.some(ext => {
          const extDate = ext.date.split('T')[0];
          const extAmt = Math.abs(ext.amount).toFixed(2);
          const extBank = cleanStr(ext.ownerBank);
          const extType = ext.type;
          const extParty = cleanStr(ext.counterpartyName);

          return extDate === newDate && 
                 extAmt === newAmt && 
                 extBank === newBank && 
                 extType === newType && 
                 extParty === newParty;
        });

        if (!isDuplicateInDb && !isDuplicateInBatch) {
          const docRef = await addDoc(collection(db, "transactions"), newT);
          uniqueToSave.push({ ...newT, id: docRef.id });
        }
      }

      if (!interruptRef.current) {
        setTransactions(prev => [...uniqueToSave, ...prev]);
        setPendingFiles([]);
        navigate('/');
        const skipped = allExtractedTransactions.length - uniqueToSave.length;
        alert(`Importação concluída! ${uniqueToSave.length} transações salvas.${skipped > 0 ? ` ${skipped} transações foram ignoradas por serem duplicatas exatas (mesmo valor, banco, favorecido, tipo e data).` : ''}`);
      }
    } catch (err: any) { 
      if (err.message.includes("interrompida")) {
          console.log("Processo interrompido com sucesso.");
      } else if (err.message.includes("429") || err.message.includes("quota") || err.message.includes("limit")) {
          setError("Limite de cota do Google atingido. Aguarde 60 segundos e tente novamente com menos arquivos.");
          alert("Erro de Cota: Você excedeu o limite de processamento por minuto do Google. Por favor, aguarde um momento e tente importar menos arquivos de uma vez.");
      } else if (err.message.includes("Requested entity was not found")) {
          setHasPaidApiKey(false);
          alert("Sua chave de API expirou ou é inválida. Por favor, selecione-a novamente.");
          handleOpenSelectKey();
      } else {
          setError(err.message); 
          console.error("Erro no processamento:", err);
          alert(`Erro no processamento: ${err.message}`);
      }
    } finally { 
      if (!interruptRef.current) {
        setIsLoading(false); 
      }
      interruptRef.current = false;
    }
  };

  const handleCancelImport = () => {
    setPendingFiles([]);
  };

  const handleUpdateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    // Atualização otimista: Reflete na UI instantaneamente
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    
    // Atualização remota em background
    updateDoc(doc(db, "transactions", id), updates).catch(err => {
      console.error("Erro ao persistir edição:", err);
    });
  }, []);

  const handleDeleteTransaction = useCallback(async (id: string) => {
    if (!confirm("Deseja realmente excluir esta transação?")) return;
    try {
      await deleteDoc(doc(db, "transactions", id));
      // A atualização do estado ocorrerá via onSnapshot
    } catch (err) {
      console.error("Erro ao excluir transação:", err);
      alert("Erro ao excluir a transação.");
    }
  }, []);

  const handleClearAllTransactions = async () => {
    if (!confirm("AVISO: Isso irá excluir permanentemente todas as transações importadas para que os valores fiquem zerados. Deseja continuar?")) return;
    setIsLoading(true);
    try {
      const transSnapshot = await getDocs(collection(db, "transactions"));
      const deletePromises = transSnapshot.docs.map(d => deleteDoc(doc(db, "transactions", d.id)));
      await Promise.all(deletePromises);
      setTransactions([]);
      alert("Todos os dados foram limpos com sucesso! Saldos de entrada, saída e saldo líquido agora estão zerados.");
    } catch (err) {
      console.error("Erro ao limpar dados:", err);
      alert("Erro ao tentar limpar os dados.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveManualBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const value = parseFloat(manualBalanceValue.replace(',', '.'));
    if (isNaN(value)) {
      alert("Por favor, insira um valor numérico válido.");
      return;
    }

    if (!manualBalanceCompanyCnpj || !manualBalanceBank) {
      alert("Por favor, selecione a empresa e o banco.");
      return;
    }

    setIsLoading(true);
    try {
      const targetCompany = uniqueCompanies.find(c => c.cnpj === manualBalanceCompanyCnpj);
      
      const newTransaction: Omit<Transaction, 'id'> = {
        date: `${manualBalanceDate}T12:00:00`,
        description: 'Lançamento Manual de Saldo',
        amount: value, 
        type: TransactionType.MANUAL, 
        counterpartyName: 'Ajuste de Saldo',
        counterpartyCnpj: '',
        paymentMethod: PaymentMethod.OUTROS,
        payerName: targetCompany?.name || 'Saldo Ajustado',
        origin: 'Saldo Manual',
        payingBank: manualBalanceBank,
        ownerName: targetCompany?.name || 'Saldo Ajustado Geral',
        ownerCnpj: manualBalanceCompanyCnpj,
        ownerBank: manualBalanceBank,
        notes: 'Inclusão corretiva de saldo manual'
      };

      const docRef = await addDoc(collection(db, "transactions"), newTransaction);
      setTransactions(prev => [{ ...newTransaction, id: docRef.id }, ...prev]);
      
      setIsManualBalanceModalOpen(false);
      setManualBalanceValue('');
      setManualBalanceBank('');
      alert("Saldo manual incluído com sucesso!");
    } catch (err) {
      console.error("Erro ao salvar saldo manual:", err);
      alert("Erro ao salvar o lançamento.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const newCompany: CompanyInfo = { 
      name: newCompanyName.trim(), 
      cnpj: newCompanyCnpj.trim() || '', 
      alternativeNames: newCompanyAltNames.filter(n => n.trim() !== ''),
      hidden: false
    };
    const docRef = await addDoc(collection(db, "companies"), newCompany);
    setRegisteredCompanies(prev => [...prev, { ...newCompany, id: docRef.id }]);
    setNewCompanyName(''); setNewCompanyCnpj(''); setNewCompanyAltNames([]); setIsAddingCompany(false);
    setShowAddAltNames(false);
  };

  const startEditCompany = (company: CompanyInfo) => {
    setEditingCnpj(company.cnpj || company.name); 
    setEditNameValue(company.name);
    setEditCnpjValue(company.cnpj);
    const altNames = company.alternativeNames || [];
    setEditAltNameValue(altNames);
    setShowEditAltNames(altNames.length > 0);
  };

  const saveCompanyEdit = async (identifier: string) => {
    const company = registeredCompanies.find(c => c.cnpj === identifier || c.name === identifier);
    if (!company?.id) return;

    const updates: Partial<CompanyInfo> = {
      cnpj: editCnpjValue.trim(),
      alternativeNames: editAltNameValue.filter(n => n.trim() !== '')
    };

    const newName = editNameValue.trim();
    if (newName !== company.name) {
      updates.name = newName;
      updates.originalName = company.name;
    } else {
      updates.name = newName;
    }

    await updateDoc(doc(db, "companies", company.id), updates);

    setRegisteredCompanies(prev => prev.map(c => 
      c.id === company.id ? { ...c, ...updates } : c
    ));

    setEditingCnpj(null);
    setShowEditAltNames(false);
  };
  
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const newUser: UserInfo = {
      userId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      name: newUserName, 
      login: newUserLogin, 
      email: newUserEmail, 
      password: newUserPassword, 
      role: newUserRole, 
      active: true
    };
    const docRef = await addDoc(collection(db, "users"), newUser);
    setUsersList(prev => [...prev, { ...newUser, id: docRef.id }]);
    setNewUserName(''); setNewUserLogin(''); setNewUserEmail(''); setNewUserPassword(''); setNewUserRole('comum');
    setIsAddingUser(false); setShowPassword(false);
  };

  const handleToggleUserStatus = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, "users", id), { active: !currentStatus });
    setUsersList(prev => prev.map(u => u.id === id ? { ...u, active: !currentStatus } : u));
  };

  const togglePasswordVisibility = (id: string) => {
    setPasswordVisibility(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGeneratePdf = (type: 'inflow' | 'outflow' | 'all', includeGroupTransfers: boolean) => {
    let data = [...filteredTransactions];
    
    // Filtrar transferências de grupo se o usuário escolheu "Não"
    if (!includeGroupTransfers) {
      data = data.filter(t => t.origin !== "Transf. Contas Grupo");
    }

    let title = "Relatório Geral de Transações";
    if (type === 'inflow') {
      data = data.filter(t => t.type === TransactionType.INFLOW);
      title = "Relatório de Entradas";
    } else if (type === 'outflow') {
      data = data.filter(t => t.type === TransactionType.OUTFLOW);
      title = "Relatório de Saídas";
    }
    setReportDataForPrint({ title, data, type });
    setIsGroupFilterModalOpen(false);
    setPendingReportType(null);
  };
  
  const handleLoginSuccess = (user: UserInfo) => {
    sessionStorage.setItem('isAuthenticated', 'true');
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    setIsAuthenticated(true);
    setCurrentUser(user);
    navigate('/');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('currentUser');
    setIsAuthenticated(false);
    setCurrentUser(null);
    navigate('/');
  };

  const currentCompanyInfo = useMemo(() => {
    if (!selectedCnpj) return { name: 'Grupo Capital Dois', cnpj: 'Múltiplas Empresas' };
    const first = filteredTransactions.find(t => (t.ownerCnpj || '').replace(/\D/g, '') === selectedCnpj.replace(/\D/g, ''));
    return { name: first?.ownerName || 'Empresa', cnpj: first?.ownerCnpj || '' };
  }, [filteredTransactions, selectedCnpj]);

  // Sincroniza o filtro da coluna Empresa com o seletor global selectedCnpj
  const handleColumnFilterChange = useCallback((field: keyof ColumnFilters, value: string) => {
    if (field === 'ownerName') {
      // Se mudar o filtro da coluna Empresa, atualiza o global selectedCnpj
      setSelectedCnpj(value || null);
    }
    setColumnFilters(prev => ({ ...prev, [field]: value }));
  }, []);

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 flex print-hidden transition-all duration-300">
        <Sidebar 
          currentUser={currentUser} 
          onLogout={handleLogout} 
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
        <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300`}>
          <header className="bg-white border-b border-slate-100 h-16 flex items-center px-6 sticky top-0 z-30 shadow-sm">
            <div className="flex-1">
              {location.pathname === '/' && <input type="text" placeholder="Busca global..." className="w-64 p-2.5 bg-slate-50 border rounded-xl text-xs outline-none focus:border-indigo-400" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />}
            </div>
            <div className="flex items-center gap-3">
              {location.pathname === '/' && (
                <>
                  {currentUser?.role === 'admin' && (
                    <button 
                      onClick={() => {
                        setManualBalanceCompanyCnpj(selectedCnpj || '');
                        setIsManualBalanceModalOpen(true);
                      }}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-emerald-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Saldo Manual
                    </button>
                  )}
                  {transactions.length > 0 && (
                    <button 
                      onClick={handleClearAllTransactions}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-rose-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Limpar Tudo
                    </button>
                  )}
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
                        // Finalizar dia logic
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
          <main className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            <Routes>
              <Route path="/" element={
                <>
                  {(transactions.length > 0 || isDataLoaded) ? (
                    <div className="max-w-[1600px] mx-auto">
                      <div className="flex flex-col lg:flex-row justify-between items-start gap-6 mb-8">
                        <div className="flex flex-col gap-1">
                          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Gestor Financeiro</h2>
                          <p className="text-sm text-slate-500 font-medium">Análise avançada via Inteligência Artificial</p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 w-full lg:w-auto">
                          <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-[10px] font-black bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1.5 outline-none border border-indigo-100" />
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">até</span>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-[10px] font-black bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1.5 outline-none border border-indigo-100" />
                          </div>
                          <select className="bg-white p-2.5 rounded-2xl text-[10px] font-black border border-slate-100 shadow-sm outline-none focus:border-indigo-300" value={selectedCnpj || ""} onChange={(e) => {
                            const val = e.target.value || null;
                            setSelectedCnpj(val);
                            handleColumnFilterChange('ownerName', val || '');
                          }}>
                            <option value="">Grupo Capital Dois</option>
                            {uniqueCompanies.map(c => <option key={c.cnpj || c.id} value={c.cnpj}>{c.name}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Botão de Navegação entre Sessões */}
                      <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-100 shadow-sm mb-12 w-fit">
                        <button 
                          onClick={() => setActiveTab('dashboard')}
                          className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          Dashboard
                        </button>
                        <button 
                          onClick={() => setActiveTab('history')}
                          className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          Histórico Detalhado
                        </button>
                      </div>

                      <div className="space-y-16">
                        {activeTab === 'dashboard' ? (
                          <section id="dashboard-summary" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center gap-4 mb-8">
                              <div className="h-px flex-1 bg-slate-100"></div>
                              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-4">Sessão: Dashboard</h3>
                              <div className="h-px flex-1 bg-slate-100"></div>
                            </div>
                            <Dashboard transactions={filteredTransactions} selectedCnpj={selectedCnpj} />
                          </section>
                        ) : (
                          <section id="detailed-history" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center gap-4 mb-8">
                              <div className="h-px flex-1 bg-slate-100"></div>
                              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-4">Sessão: Histórico Detalhado</h3>
                              <div className="h-px flex-1 bg-slate-100"></div>
                            </div>
                            <TransactionTable 
                              transactions={filteredTransactions} 
                              allTransactions={normalizedTransactions} 
                              onUpdateTransaction={handleUpdateTransaction} 
                              onDeleteTransaction={handleDeleteTransaction}
                              selectedCnpj={selectedCnpj} 
                              columnFilters={columnFilters} 
                              onColumnFilterChange={handleColumnFilterChange}
                              registeredCompanies={uniqueCompanies}
                            />
                          </section>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-32 bg-white rounded-[3rem] border border-slate-100 shadow-sm">
                      <h2 className="text-3xl font-black mb-10 text-slate-900">Bem-vindo ao C2 Gestao Financeira</h2>
                      <button onClick={() => navigate('/import')} className="bg-indigo-600 text-white font-black px-10 py-4 rounded-2xl text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Importar Extratos</button>
                    </div>
                  )}
                </>
              } />
              <Route path="/import" element={
                <div className="max-w-4xl mx-auto">
                  <div className="flex justify-between items-start mb-8">
                    <h2 className="text-2xl font-black">Importação de Extratos</h2>
                    <div className="flex flex-col items-end gap-2">
                       <button 
                        onClick={handleOpenSelectKey}
                        className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          hasPaidApiKey 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                        }`}
                      >
                        {hasPaidApiKey ? 'Chave de Faturamento Ativa' : 'Configurar Faturamento (Pay-as-you-go)'}
                      </button>
                      <a 
                        href="https://ai.google.dev/gemini-api/docs/billing" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[9px] font-bold text-slate-400 hover:text-indigo-600"
                      >
                        Saiba mais sobre o faturamento
                      </a>
                    </div>
                  </div>
                  {isLoading ? (
                    <div className="text-center py-20 bg-white rounded-[2rem] border border-slate-100 shadow-sm flex flex-col items-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                      <p className="font-black text-indigo-600 mb-2">Processando...</p>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">Aguarde, a IA está analisando os documentos</p>
                      <button 
                        onClick={() => { 
                          interruptRef.current = true;
                          setIsLoading(false); 
                          setPendingFiles([]); 
                        }}
                        className="mt-10 bg-rose-50 hover:bg-rose-100 text-rose-600 px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-rose-100 shadow-sm"
                      >
                        Interromper Importação
                      </button>
                      {error && (
                         <div className="mt-8 p-4 bg-rose-50 border border-rose-100 rounded-xl max-w-lg">
                           <p className="text-rose-600 text-xs font-black uppercase mb-1">Erro de Processamento:</p>
                           <p className="text-rose-700 text-xs font-bold leading-relaxed">{error}</p>
                         </div>
                      )}
                    </div>
                  ) : pendingFiles.length > 0 ? (
                    <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl animate-in zoom-in duration-300">
                      <div className="flex justify-between items-end mb-8">
                        <div>
                          <h3 className="text-2xl font-black text-slate-900">Conferência de Importação</h3>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                            {pendingFiles.length} {pendingFiles.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'} para análise
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </div>
                      </div>

                      <div className="max-h-[400px] overflow-y-auto custom-scrollbar mb-10 space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        {pendingFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 group hover:border-indigo-200 transition-all">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-700">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-800 truncate">{file.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">{(file.size / 1024 / 1024).toFixed(2)} MB • {file.type.split('/')[1].toUpperCase()}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-4">
                        <button 
                          onClick={handleConfirmImport}
                          className="flex-1 bg-indigo-600 text-white font-black py-5 rounded-2xl text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-[0.98]"
                        >
                          Confirmar Importação
                        </button>
                        <button 
                          onClick={handleCancelImport}
                          className="flex-1 bg-slate-100 text-slate-600 font-black py-5 rounded-2xl text-sm uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-[0.98]"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 hover:border-indigo-300 transition-all">
                      <label className="cursor-pointer block">
                        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <span className="bg-slate-900 text-white font-black px-10 py-4 rounded-2xl text-sm uppercase tracking-widest hover:bg-black transition-all inline-block shadow-lg">
                          Escolher Arquivos
                        </span>
                        <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileSelect} multiple />
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-6">Arraste seus PDFs ou clique para selecionar</p>
                      </label>
                    </div>
                  )}
                </div>
              } />
              <Route path="/companies" element={
                <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-sm">
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
                              <button onClick={() => { setEditingCnpj(null); setShowEditAltNames(false); }} className="text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Cancelar</button>
                            </div>
                          ) : ( <button onClick={() => startEditCompany(c)} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600">Editar</button> )}
                        </div>
                        {isEditing ? (
                          <div className="space-y-3">
                            <input className="w-full border rounded-lg p-2 font-bold text-xs" value={editNameValue} onChange={e => setEditNameValue(e.target.value)} placeholder="Nome Principal" />
                            <input className="w-full border rounded-lg p-2 font-bold text-xs" value={editCnpjValue} onChange={e => setEditCnpjValue(e.target.value)} placeholder="CNPJ" />
                            
                            <div className="mt-4 pt-4 border-t border-slate-200/60">
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomes Alternativos</p>
                                    <button 
                                        type="button" 
                                        onClick={() => setEditAltNameValue([...editAltNameValue, ''])}
                                        className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {editAltNameValue.map((name, idx) => (
                                        <div key={idx} className="flex gap-2">
                                            <input 
                                                className="flex-1 border rounded-lg p-2 font-bold text-[11px] outline-none focus:border-indigo-300" 
                                                value={name} 
                                                onChange={e => {
                                                    const newList = [...editAltNameValue];
                                                    newList[idx] = e.target.value;
                                                    setEditAltNameValue(newList);
                                                }} 
                                                placeholder="Nomenclatura alternativa" 
                                            />
                                            <button 
                                                type="button" 
                                                onClick={() => setEditAltNameValue(editAltNameValue.filter((_, i) => i !== idx))}
                                                className="text-rose-400 hover:text-rose-600 p-1"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                    {editAltNameValue.length === 0 && (
                                        <p className="text-[10px] italic text-slate-300">Nenhum nome alternativo cadastrado.</p>
                                    )}
                                </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-black text-xl leading-tight text-slate-900">{c.name}</h3>
                            {c.originalName && <p className="text-xs text-slate-400 font-medium -mt-1" title={`Nome anterior: ${c.originalName}`}>({c.originalName})</p>}
                            <p className="text-xs text-slate-500 font-mono mt-2">{c.cnpj || 'N/A'}</p>
                            {c.alternativeNames && c.alternativeNames.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-slate-200/60">
                                <p className="text-[9px] font-bold text-slate-400">Outros nomes:</p>
                                <p className="text-xs text-slate-600 font-semibold leading-tight">{c.alternativeNames.join(', ')}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )})}
                  </div>
                  {isAddingCompany && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
                      <div className="bg-white p-10 rounded-[2.5rem] w-full max-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-black">Nova Empresa</h3>
                            <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                            </div>
                        </div>
                        <form onSubmit={handleAddCompany} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Razão / Nome Principal</label>
                            <input required placeholder="Ex: Capital Dois Gestão Ltda" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-400 outline-none transition-all" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">CNPJ</label>
                            <input placeholder="00.000.000/0000-00" value={newCompanyCnpj} onChange={e => setNewCompanyCnpj(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-400 outline-none transition-all" />
                          </div>
                          
                          <div className="pt-2">
                            <div className="flex justify-between items-center mb-2 px-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomes Alternativos</label>
                                <button 
                                    type="button" 
                                    onClick={() => setNewCompanyAltNames([...newCompanyAltNames, ''])}
                                    className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors shadow-sm"
                                    title="Incluir outro nome"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                </button>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                                {newCompanyAltNames.map((name, idx) => (
                                    <div key={idx} className="flex gap-2 animate-in slide-in-from-top-1 duration-200">
                                        <input 
                                            className="flex-1 bg-white border border-slate-200 rounded-xl p-3 font-bold text-xs outline-none focus:border-indigo-300" 
                                            value={name} 
                                            onChange={e => {
                                                const newList = [...newCompanyAltNames];
                                                newList[idx] = e.target.value;
                                                setNewCompanyAltNames(newList);
                                            }} 
                                            placeholder="Outra forma que aparece no extrato" 
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => setNewCompanyAltNames(newCompanyAltNames.filter((_, i) => i !== idx))}
                                            className="text-rose-400 hover:text-rose-600 p-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                {newCompanyAltNames.length === 0 && (
                                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Esse CNPJ possui outros nomes?</p>
                                        <button 
                                            type="button" 
                                            onClick={() => setNewCompanyAltNames([''])}
                                            className="text-xs font-black text-indigo-600 mt-1 hover:underline"
                                        >
                                            + Clique aqui para incluir
                                        </button>
                                    </div>
                                )}
                            </div>
                          </div>

                          <div className="flex gap-3 pt-6">
                            <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Salvar Empresa</button>
                            <button type="button" onClick={() => { setIsAddingCompany(false); setNewCompanyAltNames([]); }} className="flex-1 bg-slate-100 py-4 rounded-xl font-black uppercase text-xs hover:bg-slate-200 transition-all">Cancelar</button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              } />
              <Route path="/users" element={
                <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center mb-12">
                    <h2 className="text-2xl font-black">Usuários</h2>
                    <button onClick={() => setIsAddingUser(true)} className="bg-indigo-600 text-white font-black px-6 py-3 rounded-xl text-xs uppercase">Criar Usuário</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Nome</th>
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
                            <td className="px-6 py-4">
                              <div className="font-black text-slate-900">{user.name}</div>
                              {user.userId && <div className="font-mono text-[10px] text-slate-400 mt-1">{user.userId}</div>}
                            </td>
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
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97(0 0 1 1.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg> ) : ( <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943-9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> )}
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
                              <button onClick={() => user.id && handleToggleUserStatus(user.id, user.active)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-colors ${ user.active ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100' }`}>
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
                      <div className="bg-white p-10 rounded-[2.5rem] w-full max-md shadow-2xl">
                        <h3 className="text-2xl font-black mb-6">Novo Usuário</h3>
                        <form onSubmit={handleAddUser} className="space-y-4">
                          <input required placeholder="Nome Completo" value={newUserName} onChange={e => setNewUserName(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm" />
                          <input required placeholder="Login" value={newUserLogin} onChange={e => setNewUserLogin(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm" />
                          <input required type="email" placeholder="E-mail" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm" />
                          <div className="relative">
                            <input required type={showPassword ? "text" : "password"} placeholder="Senha" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl font-bold text-sm pr-12" />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 hover:text-slate-600">
                              {showPassword ? ( <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97(0 0 1 1.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg> ) : ( <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943-9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> )}
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
              } />
            </Routes>
          </main>
        </div>

        {/* Modal: Incluir Saldo Manual */}
        {isManualBalanceModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-md shadow-2xl">
              <h3 className="text-2xl font-black mb-2">Incluir Saldo Manual</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">Insira o valor e os detalhes do saldo</p>
              <form onSubmit={handleSaveManualBalance} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Empresa</label>
                  <select 
                    required 
                    value={manualBalanceCompanyCnpj} 
                    onChange={e => setManualBalanceCompanyCnpj(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-indigo-600 focus:ring-2 focus:ring-indigo-400 outline-none transition-all appearance-none"
                  >
                    <option value="">Selecione uma Empresa</option>
                    {uniqueCompanies.map(c => <option key={c.cnpj || c.id} value={c.cnpj}>{c.name}</option>)}
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Banco</label>
                  <select 
                    required 
                    value={manualBalanceBank} 
                    onChange={e => setManualBalanceBank(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-indigo-600 focus:ring-2 focus:ring-indigo-400 outline-none transition-all appearance-none"
                  >
                    <option value="">Selecione um Banco</option>
                    {manualBalanceBanks.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Valor (R$)</label>
                  <input 
                    required 
                    type="text"
                    placeholder="Ex: 5000,00" 
                    value={manualBalanceValue} 
                    onChange={e => setManualBalanceValue(e.target.value)} 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-400 outline-none transition-all" 
                  />
                  <p className="text-[9px] text-slate-400 font-medium">Lançamentos de saldo atualizam o saldo líquido total sem somar em Entradas.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Data do Lançamento</label>
                  <input 
                    required 
                    type="date"
                    value={manualBalanceDate} 
                    onChange={e => setManualBalanceDate(e.target.value)} 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-400 outline-none transition-all" 
                  />
                </div>

                <div className="flex gap-3 pt-6">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                    Confirmar
                  </button>
                  <button type="button" onClick={() => setIsManualBalanceModalOpen(false)} className="flex-1 bg-slate-100 py-4 rounded-xl font-black uppercase text-xs hover:bg-slate-200 transition-all">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isPdfModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
            <div className="bg-white p-6 rounded-3xl w-full max-w-xs shadow-2xl text-center">
              <h3 className="text-xl font-black mb-2">Gerar Relatório PDF</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">Selecione o tipo de relatório</p>
              <div className="space-y-3">
                <button 
                  onClick={() => { setPendingReportType('inflow'); setIsPdfModalOpen(false); setIsGroupFilterModalOpen(true); }}
                  className="w-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-black py-3 rounded-2xl text-[11px] uppercase tracking-widest transition-all border border-emerald-100"
                >
                  Relatório de Entradas
                </button>
                <button 
                  onClick={() => { setPendingReportType('outflow'); setIsPdfModalOpen(false); setIsGroupFilterModalOpen(true); }}
                  className="w-full bg-rose-50 text-rose-700 hover:bg-rose-100 font-black py-3 rounded-2xl text-[11px] uppercase tracking-widest transition-all border border-rose-100"
                >
                  Relatório de Saídas
                </button>
                <button 
                  onClick={() => { setPendingReportType('all'); setIsPdfModalOpen(false); setIsGroupFilterModalOpen(true); }}
                  className="w-full bg-slate-800 text-white hover:bg-black font-black py-3 rounded-2xl text-[11px] uppercase tracking-widest transition-all"
                >
                  Relatório Geral
                </button>
              </div>
              <button 
                onClick={() => setIsPdfModalOpen(false)}
                className="mt-6 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {isGroupFilterModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
            <div className="bg-white p-6 rounded-3xl w-full max-w-xs shadow-2xl text-center animate-in zoom-in duration-200">
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <h3 className="text-lg font-black mb-2">Inclusão de Grupo</h3>
              <p className="text-[11px] text-slate-600 font-bold mb-6 leading-relaxed uppercase tracking-tight">
                Deseja incluir <span className="text-indigo-600">Transf. Contas Grupo</span>?
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => pendingReportType && handleGeneratePdf(pendingReportType, true)}
                  className="flex-1 bg-indigo-600 text-white font-black py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  Sim
                </button>
                <button 
                  onClick={() => pendingReportType && handleGeneratePdf(pendingReportType, false)}
                  className="flex-1 bg-slate-100 text-slate-600 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Não
                </button>
              </div>
              <button 
                onClick={() => { setIsGroupFilterModalOpen(false); setPendingReportType(null); }}
                className="mt-6 text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
      
      {reportDataForPrint && <PrintLayout reportData={reportDataForPrint} companyInfo={currentCompanyInfo} logoUrl={logoUrl} dateRange={{ start: startDate, end: endDate }} registeredCompanies={registeredCompanies} />}
    </>
  );
};

export default App;
