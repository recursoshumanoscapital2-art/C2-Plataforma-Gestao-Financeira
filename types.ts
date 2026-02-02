
export enum TransactionType {
  INFLOW = 'entrada',
  OUTFLOW = 'saída',
  MANUAL = 'saldo manual',
  GROUP = 'grupo'
}

export enum PaymentMethod {
  PIX = 'PIX',
  TED = 'TED',
  BOLETO = 'BOLETO',
  CARTAO = 'CARTÃO',
  OUTROS = 'OUTROS'
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  counterpartyName: string;
  counterpartyCnpj: string;
  paymentMethod: PaymentMethod;
  payerName: string;
  origin: string;
  payingBank: string;
  ownerName: string;
  ownerCnpj: string;
  ownerBank: string;
  notes: string; // Adicionado campo de observações
}

export interface StatementResult {
  ownerName: string;
  ownerCnpj: string;
  ownerBank: string;
  transactions: Transaction[];
}

export interface FinancialSummary {
  totalInflow: number;
  totalOutflow: number;
  balance: number;
  transactionCount: number;
}
