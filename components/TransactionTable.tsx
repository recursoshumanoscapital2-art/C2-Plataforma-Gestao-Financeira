import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Transaction, TransactionType } from '../types';
import { ColumnFilters } from '../App';

interface TransactionTableProps {
  transactions: Transaction[];
  allTransactions: Transaction[];
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => void;
  onDeleteTransaction: (id: string) => void;
  selectedCnpj: string | null;
  columnFilters: ColumnFilters;
  onColumnFilterChange: (field: keyof ColumnFilters, value: string) => void;
  registeredCompanies: any[]; 
}

const TransactionTable: React.FC<TransactionTableProps> = ({ 
  transactions, 
  allTransactions,
  onUpdateTransaction, 
  onDeleteTransaction,
  selectedCnpj,
  columnFilters,
  onColumnFilterChange,
  registeredCompanies
}) => {
  const [editingCell, setEditingCell] = useState<{ id: string, field: keyof Transaction } | null>(null);
  const [tempValue, setTempValue] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [sortAmount, setSortAmount] = useState<'asc' | 'desc' | 'none'>('none');
  const filterRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const startEditing = (id: string, field: keyof Transaction, currentVal: string) => {
    setEditingCell({ id, field });
    setTempValue(currentVal);
  };

  const saveEdit = () => {
    if (editingCell) {
      const field = editingCell.field;
      let valueToSave: any = tempValue;
      
      if (field === 'amount') {
        const cleaned = tempValue.replace(/[^\d,.-]/g, '').replace(',', '.');
        valueToSave = parseFloat(cleaned);
        if (isNaN(valueToSave)) {
          setEditingCell(null);
          return;
        }
      }
      
      onUpdateTransaction(editingCell.id, { [field]: valueToSave });
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditingCell(null);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setActiveFilter(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const uniqueData = useMemo(() => {
    return {
      banks: Array.from(new Set(allTransactions.map(t => t.ownerBank))).sort(),
      origins: Array.from(new Set(allTransactions.map(t => t.origin))).sort(),
      counterparties: Array.from(new Set(allTransactions.filter(t => t.type === TransactionType.OUTFLOW).map(t => t.counterpartyName))).sort(),
    };
  }, [allTransactions]);

  const duplicateIds = useMemo(() => {
    const counts = new Map<string, string[]>();
    transactions.forEach(t => {
      // Regra de duplicidade solicitada: Valor, Banco, Tipo, Data e Favorecido
      const datePart = t.date ? t.date.split('T')[0] : 'no-date';
      const key = `${t.amount}_${t.ownerBank}_${t.type}_${datePart}_${t.counterpartyName}`;
      if (!counts.has(key)) counts.set(key, []);
      counts.get(key)!.push(t.id);
    });
    
    const ids = new Set<string>();
    counts.forEach(group => {
      if (group.length > 1) {
        group.forEach(id => ids.add(id));
      }
    });
    return ids;
  }, [transactions]);

  const sortedTransactions = useMemo(() => {
    const result = [...transactions];
    if (sortAmount === 'asc') {
      result.sort((a, b) => a.amount - b.amount);
    } else if (sortAmount === 'desc') {
      result.sort((a, b) => b.amount - a.amount);
    }
    return result;
  }, [transactions, sortAmount]);

  const toggleFilter = (column: string) => {
    setActiveFilter(activeFilter === column ? null : column);
  };

  const handleToggleSort = () => {
    setSortAmount(prev => {
      if (prev === 'none') return 'desc';
      if (prev === 'desc') return 'asc';
      return 'none';
    });
  };

  const HeaderCell = ({ label, field, type = 'select', options = [], align = 'left', className = '', isSortable = false }: { label: string, field: keyof ColumnFilters, type?: 'select' | 'date' | 'text', options?: {label: string, value: string}[], align?: 'left' | 'right', className?: string, isSortable?: boolean }) => {
    const isActive = activeFilter === field;
    const hasFilter = columnFilters[field] !== '';

    return (
      <th className={`${className || 'px-2.5'} py-5 relative ${align === 'right' ? 'text-right' : ''}`}>
        <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
          <button 
            onClick={() => toggleFilter(field)}
            className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-colors hover:text-indigo-600 focus:outline-none ${
              align === 'right' ? 'flex-row-reverse' : ''
            } ${
              hasFilter ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            {label}
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${isActive ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          
          {isSortable && (
            <button 
              onClick={handleToggleSort}
              className={`p-1 rounded hover:bg-slate-100 transition-colors ${sortAmount !== 'none' ? 'text-indigo-600' : 'text-slate-300'}`}
              title="Ordenar por valor"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={sortAmount === 'asc' ? "M5 15l7-7 7 7" : sortAmount === 'desc' ? "M19 9l-7 7-7-7" : "M7 10l5-5 5 5M7 14l5 5 5-5"} />
              </svg>
            </button>
          )}
        </div>

        {isActive && (
          <div ref={filterRef} className={`absolute ${align === 'right' ? 'right-2.5' : 'left-2.5'} top-full mt-1 z-50 bg-white border border-slate-200 shadow-2xl rounded-xl p-3 min-w-[200px] animate-in fade-in zoom-in duration-150 text-left`}>
            {type === 'date' ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtrar por Data</p>
                <input 
                  ref={dateInputRef}
                  key={columnFilters.date}
                  type="date" 
                  autoFocus
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs outline-none focus:border-indigo-400 font-bold text-slate-700"
                  defaultValue={columnFilters.date}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => {
                      if (dateInputRef.current) {
                        onColumnFilterChange('date', dateInputRef.current.value);
                      }
                      setActiveFilter(null);
                    }}
                    className="flex-1 bg-indigo-600 text-white rounded-lg py-1.5 text-[10px] font-bold uppercase hover:bg-indigo-700"
                  >
                    Confirmar
                  </button>
                  {columnFilters.date && (
                    <button 
                      onClick={() => { 
                        onColumnFilterChange('date', ''); 
                        setActiveFilter(null); 
                      }}
                      className="text-[9px] text-rose-500 font-bold hover:underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
            ) : type === 'select' ? (
              <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                <button 
                  onClick={() => { onColumnFilterChange(field, ''); setActiveFilter(null); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${columnFilters[field] === '' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  Tudo
                </button>
                {options.map(opt => (
                  <button 
                    key={opt.value}
                    onClick={() => { onColumnFilterChange(field, opt.value); setActiveFilter(null); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors truncate ${columnFilters[field] === opt.value ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtrar {label}</p>
                <input 
                  type="text" 
                  autoFocus
                  placeholder={`Digite um ${label.toLowerCase()}...`}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs outline-none focus:border-indigo-400 font-bold text-slate-700"
                  value={columnFilters[field]}
                  onChange={(e) => onColumnFilterChange(field, e.target.value)}
                />
                {columnFilters[field] && (
                  <button 
                    onClick={() => onColumnFilterChange(field, '')}
                    className="text-[9px] text-rose-500 font-bold hover:underline"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </th>
    );
  };

  const handleClearAllFilters = () => {
    Object.keys(columnFilters).forEach(key => onColumnFilterChange(key as keyof ColumnFilters, ''));
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-12">
      <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-white">
        <div>
          <h3 className="text-slate-900 font-black text-xl tracking-tight">Histórico Detalhado</h3>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
            {transactions.length} transações encontradas • Clique no cabeçalho para filtrar
          </p>
        </div>
        
        {Object.values(columnFilters).some(v => v !== '') && (
          <button 
            onClick={handleClearAllFilters}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100"
          >
            Limpar Todos os Filtros
          </button>
        )}
      </div>

      {sortedTransactions.length === 0 ? (
        <div className="py-24 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h4 className="text-slate-900 font-black text-lg">Nenhum dado encontrado</h4>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1 mb-10">
            Ajuste seus filtros para visualizar outras transações
          </p>
          <button 
            onClick={handleClearAllFilters}
            className="bg-indigo-600 text-white font-black px-10 py-4 rounded-2xl text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
          >
            Limpar Filtros
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse table-fixed min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <HeaderCell label="Data" field="date" type="date" />
                <HeaderCell 
                  label="Empresa" 
                  field="ownerName" 
                  options={registeredCompanies.map(c => ({ label: c.name, value: c.cnpj }))} 
                />
                <HeaderCell label="Banco" field="payingBank" options={uniqueData.banks.map(b => ({ label: b, value: b }))} />
                <HeaderCell label="Tipo" field="type" className="pl-0.5 pr-2.5" options={['entrada', 'saída', 'saldo manual'].map(t => ({ label: t, value: t }))} />
                <HeaderCell label="Origem" field="origin" options={uniqueData.origins.map(o => ({ label: o, value: o }))} />
                <HeaderCell label="Favorecido" field="counterpartyName" options={uniqueData.counterparties.map(c => ({ label: c, value: c }))} />
                <HeaderCell label="Valor" field="amount" type="text" align="right" className="pl-0.5 pr-2.5" isSortable={true} />
                <th className="px-5 py-5 w-72 text-[10px] font-black uppercase tracking-widest text-slate-400">Observações</th>
                <th className="px-2.5 py-5 w-20 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedTransactions.map((t) => {
                const isDuplicate = duplicateIds.has(t.id);
                return (
                  <tr key={t.id} className="hover:bg-indigo-50/20 transition-colors group">
                    <td className="px-2.5 py-4 text-[11px] font-bold text-slate-500 whitespace-nowrap">
                      {t.date.split('T')[0].split('-').reverse().join('/')}
                    </td>

                    <td className="px-2.5 py-4">
                      <div className="text-[11px] font-black text-slate-800 truncate" title={t.ownerName}>
                        {t.ownerName}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono tracking-tight mt-0.5">{t.ownerCnpj}</div>
                    </td>

                    <td className="px-2.5 py-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 truncate" title={t.ownerBank}>
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                        <span className="truncate">{t.ownerBank}</span>
                      </div>
                    </td>

                    <td className="pl-0.5 pr-2.5 py-4 text-left relative">
                      {editingCell?.id === t.id && editingCell.field === 'type' ? (
                        <select
                          autoFocus
                          className="w-full border-2 border-indigo-400 rounded-lg px-2 py-1 text-[11px] outline-none shadow-sm appearance-none bg-white"
                          value={tempValue}
                          onChange={(e) => {
                            onUpdateTransaction(t.id, { type: e.target.value as TransactionType });
                            setEditingCell(null);
                          }}
                          onBlur={() => setEditingCell(null)}
                        >
                          <option value={TransactionType.INFLOW}>entrada</option>
                          <option value={TransactionType.OUTFLOW}>saída</option>
                          <option value={TransactionType.MANUAL}>saldo manual</option>
                        </select>
                      ) : (
                        <span 
                          onClick={() => startEditing(t.id, 'type', t.type)}
                          className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase inline-block border cursor-pointer transition-all hover:scale-105 ${
                          t.type === TransactionType.INFLOW 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                          : t.type === TransactionType.OUTFLOW 
                          ? 'bg-rose-50 text-rose-700 border-rose-100'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}>
                          {t.type}
                        </span>
                      )}
                    </td>

                    <td className="px-2.5 py-4">
                      {editingCell?.id === t.id && editingCell.field === 'origin' ? (
                        <input
                          autoFocus
                          className="w-full border-2 border-indigo-400 rounded-lg px-2 py-1.5 text-[11px] outline-none shadow-sm"
                          value={tempValue}
                          onChange={(e) => setTempValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={handleKeyDown}
                        />
                      ) : (
                        <div 
                          onClick={() => startEditing(t.id, 'origin', t.origin)}
                          className={`text-[11px] font-bold cursor-pointer border-b border-transparent hover:border-indigo-200 truncate flex items-center gap-1.5 min-h-[1.2rem] ${!t.origin ? 'text-slate-300' : 'text-slate-600'}`}
                        >
                          {t.origin || <span className="italic font-medium">Adicionar...</span>}
                        </div>
                      )}
                    </td>

                    <td className="px-2.5 py-4">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <div className="flex-1 min-w-0 flex items-center overflow-hidden">
                          <div className="text-[12px] font-black text-slate-900 truncate leading-tight mr-1" title={t.counterpartyName || '-'}>
                            {t.counterpartyName || '-'}
                          </div>
                        </div>
                      </div>
                      {t.type !== TransactionType.INFLOW && (
                        <div className="text-[9px] text-slate-400 truncate mt-0.5 opacity-80" title={t.description}>
                          {t.description}
                        </div>
                      )}
                    </td>

                    <td className={`pl-0.5 pr-2.5 py-4 text-sm font-black text-right whitespace-nowrap ${
                      t.type === TransactionType.INFLOW ? 'text-emerald-600' : 
                      t.type === TransactionType.OUTFLOW ? 'text-rose-600' : 'text-indigo-600'
                    }`}>
                      {editingCell?.id === t.id && editingCell.field === 'amount' ? (
                        <input
                          autoFocus
                          className="w-full border-2 border-indigo-400 rounded-lg px-2 py-1.5 text-[11px] outline-none shadow-sm text-right font-black"
                          value={tempValue}
                          onChange={(e) => setTempValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={handleKeyDown}
                        />
                      ) : (
                        <div 
                          onClick={() => startEditing(t.id, 'amount', t.amount.toString())}
                          className="cursor-pointer border-b border-transparent hover:border-indigo-200"
                        >
                          <span className="text-[10px] text-slate-400 mr-1 font-bold">R$</span>
                          {t.type === TransactionType.OUTFLOW ? '-' : ''} 
                          {Math.abs(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      {editingCell?.id === t.id && editingCell.field === 'notes' ? (
                        <input
                          autoFocus
                          className="w-full border-2 border-indigo-400 rounded-lg px-2 py-1.5 text-[11px] outline-none shadow-sm"
                          placeholder="Nota..."
                          value={tempValue}
                          onChange={(e) => setTempValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={handleKeyDown}
                        />
                      ) : (
                        <div 
                          onClick={() => startEditing(t.id, 'notes', t.notes)}
                          className={`text-[10px] cursor-pointer border-b border-transparent hover:border-indigo-200 min-h-[1.2rem] italic leading-tight truncate ${t.notes ? 'text-indigo-600 font-bold' : 'text-slate-300 font-medium'}`}
                          title={t.notes}
                        >
                          {t.notes || 'Adicionar obs...'}
                        </div>
                      )}
                    </td>

                    <td className="px-2.5 py-4 text-center">
                      {isDuplicate && (
                        <button 
                          onClick={() => onDeleteTransaction(t.id)}
                          className="p-1.5 rounded-lg transition-all active:scale-90 text-rose-400 bg-rose-50 hover:text-rose-600 hover:bg-rose-100"
                          title="Excluir duplicata"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TransactionTable;
