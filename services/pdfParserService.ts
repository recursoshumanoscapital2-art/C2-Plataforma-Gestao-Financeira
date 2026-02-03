import { Transaction, TransactionType, PaymentMethod, StatementResult } from "../types";

declare const pdfjsLib: any;

// Configura o worker do PDF.js usando a mesma versão do script no index.html
if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export async function parsePDFLocally(file: File): Promise<StatementResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let fullText = "";
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Ordenar itens por posição Y (topo para baixo) e depois X (esquerda para direita)
    const items = textContent.items.sort((a: any, b: any) => {
      if (Math.abs(a.transform[5] - b.transform[5]) > 5) {
        return b.transform[5] - a.transform[5];
      }
      return a.transform[4] - b.transform[4];
    });

    let lastY = -1;
    let pageText = "";
    for (const item of items) {
      if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
        pageText += "\n";
      } else if (pageText !== "" && !pageText.endsWith("\n")) {
        pageText += " ";
      }
      pageText += item.str;
      lastY = item.transform[5];
    }
    fullText += pageText + "\n";
  }

  // 1. Extrair Dados do Titular (Owner)
  const cnpjRegex = /CNPJ\s*[:\-\s]*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i;
  const cnpjMatch = fullText.match(cnpjRegex);
  const ownerCnpj = cnpjMatch ? cnpjMatch[1].replace(/\D/g, '') : '';

  const lines = fullText.split("\n").map(l => l.trim()).filter(l => l.length > 3);
  let ownerName = "Empresa Não Identificada";
  const blackList = ["extrato", "periodo", "página", "saldo", "banco", "emissão", "data", "conta"];
  
  for (let line of lines) {
    const lowerLine = line.toLowerCase();
    const isGeneric = blackList.some(word => lowerLine.includes(word));
    const hasDate = /\d{2}\/\d{2}/.test(line);
    
    if (!isGeneric && !hasDate && line.length > 5) {
      ownerName = line.split("  ")[0].substring(0, 60).trim();
      break;
    }
  }

  const banks = ["Itaú", "Bradesco", "Santander", "Brasil", "Caixa", "Nubank", "Inter", "BTG", "Safra", "C6"];
  const ownerBank = banks.find(b => fullText.toLowerCase().includes(b.toLowerCase())) || "Banco Não Identificado";

  // 2. Extrair Transações
  const transactionRegex = /(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.*?)\s+(-?\s?[\d\.]+,\d{2}|[\d\.]+,\d{2}\s?-)/g;
  const transactions: Transaction[] = [];
  let match;

  while ((match = transactionRegex.exec(fullText)) !== null) {
    const dateStr = match[1];
    const description = match[2].trim();
    let rawValue = match[3].replace(/\s/g, '');
    
    // Regra específica para Invest. Resgate Autom. (sempre entrada)
    const isResgateBB = description.toLowerCase().includes("invest. resgate autom.");
    
    const isNegative = !isResgateBB && (
                      rawValue.includes('-') || 
                      description.toLowerCase().includes("pagamento") || 
                      description.toLowerCase().includes("débito") ||
                      description.toLowerCase().includes("tarifa") ||
                      description.toLowerCase().includes("pix -") ||
                      description.toLowerCase().includes("transf. enviada")
    );

    const amount = Math.abs(parseFloat(rawValue.replace('-', '').replace(/\./g, '').replace(',', '.')));
    
    if (isNaN(amount) || amount === 0) continue;

    let finalDate = "";
    try {
      const parts = dateStr.split('/');
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2] || new Date().getFullYear().toString();
      finalDate = `${year}-${month}-${day}T12:00:00`;
    } catch (e) {
      finalDate = new Date().toISOString();
    }

    let paymentMethod = PaymentMethod.OUTROS;
    const descUpper = description.toUpperCase();
    if (descUpper.includes("PIX")) paymentMethod = PaymentMethod.PIX;
    else if (descUpper.includes("TED") || descUpper.includes("DOC")) paymentMethod = PaymentMethod.TED;
    else if (descUpper.includes("BOLETO") || descUpper.includes("TITULO")) paymentMethod = PaymentMethod.BOLETO;
    else if (descUpper.includes("CARTAO") || descUpper.includes("COMPRA")) paymentMethod = PaymentMethod.CARTAO;

    transactions.push({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      date: finalDate,
      description: description,
      amount: amount,
      type: isNegative ? TransactionType.OUTFLOW : TransactionType.INFLOW,
      counterpartyName: 'Extraído via PDF',
      counterpartyCnpj: '',
      paymentMethod: paymentMethod,
      payerName: isNegative ? ownerName : 'Terceiro',
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
