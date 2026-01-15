// Use the recommended import syntax for GoogleGenAI and Type
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TransactionType, PaymentMethod, StatementResult } from "../types";

export async function processStatement(fileBase64: string, mimeType: string): Promise<StatementResult> {
  // FIX: Per coding guidelines, the API key must be obtained from process.env.API_KEY.
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("A variável de ambiente VITE_API_KEY não está configurada no seu ambiente de hospedagem (Render). Por favor, defina a variável 'VITE_API_KEY' nas configurações do seu serviço no Render.");
  }
  
  // Initialize GoogleGenAI with the key from the environment
  const ai = new GoogleGenAI({apiKey: apiKey});

  // Utilizando o modelo gemini-3-flash-preview para uma análise rápida e gratuita.
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            data: fileBase64,
            mimeType: mimeType
          }
        },
        {
          text: "Analise o extrato bancário (PDF ou Imagem) e extraia os dados para o formato JSON solicitado. Foque na precisão absoluta dos valores e datas."
        }
      ]
    },
    config: {
      systemInstruction: `Você é um especialista em contabilidade e análise bancária brasileira.
          Sua tarefa é converter extratos bancários em dados estruturados com precisão absoluta.
          
          REGRAS CRÍTICAS PARA O PROPRIETÁRIO (OWNER):
          1. ownerName: Identifique a Razão Social ou Nome do Titular da conta.
          2. ownerCnpj: EXTRAIA O CNPJ APENAS se houver explicitamente a nomenclatura 'CNPJ' seguida de números no documento. Se não encontrar o termo 'CNPJ' explicitamente, deixe este campo vazio ("").
          3. ownerBank: Identifique o banco emissor.
          
          REGRAS PARA TRANSAÇÕES:
          - Identifique cada linha de movimentação.
          - date: Formato ISO 8601 (YYYY-MM-DDTHH:mm:ss).
          - amount: Valor numérico positivo.
          - type: "entrada" para créditos/depósitos, "saída" para débitos/pagamentos/tarifas.
          - paymentMethod: Classifique em PIX, TED, BOLETO, CARTÃO ou OUTROS.
          - origin: Descreva a natureza (ex: Venda, Tarifa, Transferência).
          - counterpartyName: Nome de quem recebeu ou enviou o dinheiro.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ownerName: { type: Type.STRING },
          ownerCnpj: { type: Type.STRING },
          ownerBank: { type: Type.STRING },
          transactions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                description: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                type: { type: Type.STRING },
                counterpartyName: { type: Type.STRING },
                counterpartyCnpj: { type: Type.STRING },
                paymentMethod: { type: Type.STRING },
                payerName: { type: Type.STRING },
                origin: { type: Type.STRING },
                payingBank: { type: Type.STRING }
              },
              required: ['date', 'amount', 'type', 'description']
            }
          }
        },
        required: ['ownerName', 'ownerCnpj', 'ownerBank', 'transactions']
      }
    }
  });

  // response.text is a getter property, safely access it without method call
  const jsonStr = response.text?.trim() ?? "{}";
  const rawData = JSON.parse(jsonStr);
  
  const ownerName = rawData.ownerName || 'Empresa não identificada';
  const ownerCnpj = rawData.ownerCnpj || '';
  const ownerBank = rawData.ownerBank || 'Banco não identificado';
  
  return {
    ownerName,
    ownerCnpj,
    ownerBank,
    transactions: (rawData.transactions || []).map((item: any, index: number) => ({
      // Using substring instead of deprecated substr
      id: `${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
      date: item.date || new Date().toISOString(),
      description: item.description || 'Sem descrição',
      amount: item.amount || 0,
      type: item.type === 'entrada' ? TransactionType.INFLOW : TransactionType.OUTFLOW,
      counterpartyName: item.counterpartyName || 'Não identificado',
      counterpartyCnpj: item.counterpartyCnpj || '',
      paymentMethod: (item.paymentMethod as PaymentMethod) || PaymentMethod.OUTROS,
      payerName: item.type === 'saída' ? ownerName : (item.counterpartyName || 'Terceiro'),
      origin: item.origin || 'Extração IA',
      payingBank: item.payingBank || ownerBank,
      notes: '', 
      ownerName,
      ownerCnpj,
      ownerBank
    }))
  };
}
