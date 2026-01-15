
import { Transaction, TransactionType, PaymentMethod, StatementResult } from "../types";

declare const pdfjsLib: any;

export async function parsePDFLocally(file: File): Promise<StatementResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    fullText += pageText + "\n";
  }

  // 1. Extrair Dados do Titular (Owner)
  // Tenta achar o CNPJ seguindo a regra: Palavra CNPJ + Número
  const cnpjRegex = /CNPJ\s*[:\-\s]*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i;
  const cnpjMatch = fullText.match(cnpjRegex);
  const ownerCnpj = cnpjMatch ? cnpjMatch[1].replace(/\D/g, '') : '';

  // Heurística para Nome da Empresa: Geralmente é uma das primeiras linhas grandes
  // Vamos pegar a primeira linha que pareça um nome de empresa (maiusculas, sem ser data)
  const lines = fullText.split("\n").map(l => l.trim()).filter(l => l.length > 5);
  let ownerName = "Empresa Não Identificada";
  for(let line of lines) {
    if(!line.match(/\d{2}\/\d{2}/) && !line.includes("Extrato") && !line.includes("Saldo")) {
      ownerName = line.substring(0, 50);
      break;
    }
  }

  // Heurística para Banco
  const banks = ["Itaú", "Bradesco", "Santander", "Banco do Brasil", "Caixa", "Nubank", "Inter", "BTG", "Safra", "C6"];
  const ownerBank = banks.find(b => fullText.toLowerCase().includes(b.toLowerCase())) || "Banco Não Identificado";

  // 2. Extrair Transações
  // Padrão: Data (DD/MM ou DD/MM/AAAA) + Descrição + Valor
  const transactionRegex = /(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.*?)\s+(-?[\d\.]+,\d{2})/g;
  const transactions: Transaction[] = [];
  let match;

  while ((match = transactionRegex.exec(fullText)) !== null) {
    const dateStr = match[1];
    const description = match[2].trim();
    const rawValue = match[3].replace(/\./g, '').replace(',', '.');
    const amount = Math.abs(parseFloat(rawValue));
    const isOutflow = rawValue.includes('-') || 
                      description.toLowerCase().includes("pagamento") || 
                      description.toLowerCase().includes("transferencia") ||
                      description.toLowerCase().includes("pix") ||
                      description.toLowerCase().includes("tarifa");

    // Formatar data para ISO
    let finalDate = dateStr;
    if (dateStr.length === 5) {
      finalDate = `${new Date().getFullYear()}-${dateStr.split('/')[1]}-${dateStr.split('/')[0]}T12:00:00`;
    } else {
      const parts = dateStr.split('/');
      finalDate = `${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`;
    }

    // Determinar Método de Pagamento
    let paymentMethod = PaymentMethod.OUTROS;
    if (description.toUpperCase().includes("PIX")) paymentMethod = PaymentMethod.PIX;
    else if (description.toUpperCase().includes("TED") || description.toUpperCase().includes("DOC")) paymentMethod = PaymentMethod.TED;
    else if (description.toUpperCase().includes("BOLETO")) paymentMethod = PaymentMethod.BOLETO;
    else if (description.toUpperCase().includes("CARTAO") || description.toUpperCase().includes("COMPRA")) paymentMethod = PaymentMethod.CARTAO;

    transactions.push({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: finalDate,
      description: description,
      amount: amount,
      type: isOutflow ? TransactionType.OUTFLOW : TransactionType.INFLOW,
      counterpartyName: 'Extraído via PDF',
      counterpartyCnpj: '',
      paymentMethod: paymentMethod,
      payerName: isOutflow ? ownerName : 'Terceiro',
      origin: 'Importação PDF Local',
      payingBank: ownerBank,
      ownerName,
      ownerCnpj,
      ownerBank,
      notes: ''
    });
  }

  return {
    ownerName,
    ownerCnpj,
    ownerBank,
    transactions
  };
}
