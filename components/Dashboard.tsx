
import React, { useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Transaction, TransactionType } from '../types';

interface DashboardProps {
  transactions: Transaction[];
  selectedCnpj: string | null;
  logoUrl: string | null;
  onLogoChange: (url: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, selectedCnpj, logoUrl, onLogoChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentOwner = useMemo(() => {
    if (!selectedCnpj || transactions.length === 0) {
      return { name: 'Grupo Capital Dois', cnpj: 'Múltiplas Empresas', bank: 'Vários' };
    }
    const first = transactions[0];
    return { name: first.ownerName, cnpj: first.ownerCnpj, bank: first.ownerBank };
  }, [transactions, selectedCnpj]);

  const summary = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.type === TransactionType.INFLOW) acc.totalInflow += t.amount;
      else acc.totalOutflow += t.amount;
      return acc;
    }, { totalInflow: 0, totalOutflow: 0 });
  }, [transactions]);

  const methodData = useMemo(() => {
    const counts: Record<string, number> = {};
    transactions.forEach(t => {
      counts[t.paymentMethod] = (counts[t.paymentMethod] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const timelineData = useMemo(() => {
    const days: Record<string, { date: string, inflow: number, outflow: number }> = {};
    transactions.forEach(t => {
      const day = t.date.split('T')[0];
      if (!days[day]) days[day] = { date: day, inflow: 0, outflow: 0 };
      if (t.type === TransactionType.INFLOW) days[day].inflow += t.amount;
      else days[day].outflow += t.amount;
    });
    return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions]);

  const handleLogoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          onLogoChange(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (transactions.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
      {/* Summary Card */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Saúde Financeira</h3>
            
            <div 
              onClick={handleLogoClick}
              className="relative w-14 h-14 bg-slate-50 border border-dashed border-slate-200 rounded-xl overflow-hidden cursor-pointer group hover:bg-indigo-50 hover:border-indigo-200 transition-all flex items-center justify-center shadow-sm"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-300 group-hover:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange} 
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                 <span className="text-[8px] font-bold text-indigo-600 bg-white/90 px-1.5 py-0.5 rounded shadow-sm">Editar</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-slate-900 font-extrabold text-xl truncate" title={currentOwner.name}>{currentOwner.name}</p>
            <div className="flex justify-between items-center mt-2">
              <p className="text-slate-400 text-xs font-mono tracking-tight">{currentOwner.cnpj}</p>
              <div className="flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded text-indigo-700">
                <span className="text-[9px] font-black uppercase tracking-tighter">{currentOwner.bank}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100/50">
              <p className="text-[10px] text-emerald-600 font-black mb-1 uppercase tracking-wider">Entradas</p>
              <p className="text-xl font-black text-emerald-700">
                R$ {summary.totalInflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-rose-50/40 p-4 rounded-xl border border-rose-100/50 text-right">
              <p className="text-[10px] text-rose-600 font-black mb-1 uppercase tracking-wider">Saídas</p>
              <p className="text-xl font-black text-rose-700">
                R$ {summary.totalOutflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="pt-5 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">Saldo Líquido no Período</p>
            <div className="flex items-center justify-between">
              <p className={`text-3xl font-black ${summary.totalInflow - summary.totalOutflow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                R$ {(summary.totalInflow - summary.totalOutflow).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <div className={`w-3 h-3 rounded-full ${summary.totalInflow - summary.totalOutflow >= 0 ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400 animate-pulse'}`}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods Section (Counters) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-slate-500 text-[10px] font-bold mb-6 uppercase tracking-widest">Métodos de Pagamento</h3>
        <div className="grid grid-cols-2 gap-4">
          {methodData.map((method, index) => (
            <div key={method.name} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center justify-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{method.name}</p>
              <p className="text-2xl font-black text-slate-900">{method.value}</p>
              <div className="mt-2 w-8 h-1 rounded-full" style={{ backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899'][index % 6] }}></div>
            </div>
          ))}
          {methodData.length === 0 && (
            <div className="col-span-2 text-center py-10">
              <p className="text-slate-300 text-[10px] font-bold uppercase">Nenhum dado</p>
            </div>
          )}
        </div>
      </div>

      {/* Chart: Timeline */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-1">
        <h3 className="text-slate-500 text-[10px] font-bold mb-4 uppercase tracking-widest">Evolução no Filtro</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                labelStyle={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Bar dataKey="inflow" fill="#10b981" radius={[6, 6, 0, 0]} name="Entrada" />
              <Bar dataKey="outflow" fill="#f43f5e" radius={[6, 6, 0, 0]} name="Saída" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
