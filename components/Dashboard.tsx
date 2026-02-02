import React, { useMemo, useRef, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Transaction, TransactionType } from '../types';

interface DashboardProps {
  transactions: Transaction[];
  selectedCnpj: string | null;
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, selectedCnpj }) => {

  const currentOwner = useMemo(() => {
    if (!selectedCnpj || transactions.length === 0) {
      return { name: 'Grupo Capital Dois', cnpj: 'Múltiplas Empresas', bank: 'Vários' };
    }
    const first = transactions[0];
    return { name: first.ownerName, cnpj: first.ownerCnpj, bank: first.ownerBank };
  }, [transactions, selectedCnpj]);

  const summary = useMemo(() => {
    return transactions.reduce((acc, t) => {
      const val = Math.abs(t.amount);
      if (t.type === TransactionType.INFLOW) acc.totalInflow += val;
      else if (t.type === TransactionType.OUTFLOW) acc.totalOutflow += val;
      else if (t.type === TransactionType.MANUAL) acc.totalManual += t.amount;
      return acc;
    }, { totalInflow: 0, totalOutflow: 0, totalManual: 0 });
  }, [transactions]);

  const timelineData = useMemo(() => {
    const days: Record<string, { date: string, inflow: number, outflow: number }> = {};
    transactions.forEach(t => {
      if (t.type === TransactionType.MANUAL) return; 
      const day = t.date.split('T')[0];
      if (!days[day]) days[day] = { date: day, inflow: 0, outflow: 0 };
      
      const val = Math.abs(t.amount);
      if (t.type === TransactionType.INFLOW) days[day].inflow += val;
      else if (t.type === TransactionType.OUTFLOW) days[day].outflow += val;
    });
    return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions]);

  // Saldo Líquido no Período: Saldo Manual (ponto de partida) + Entradas - Saídas
  const netBalance = summary.totalManual + summary.totalInflow - summary.totalOutflow;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
      {/* Summary Card */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Saúde Financeira</h3>
            </div>
          </div>

          <div className="mb-6 mt-6">
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
            <div className="flex justify-between items-end mb-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Saldo Líquido no Período</p>
              {summary.totalManual !== 0 && (
                <span className="text-[8px] text-indigo-500 font-black uppercase">Inclui Ajustes Manuais</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className={`text-3xl font-black ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                R$ {netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <div className={`w-3 h-3 rounded-full ${netBalance >= 0 ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400 animate-pulse'}`}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart: Timeline */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2">
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
