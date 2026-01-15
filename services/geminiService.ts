import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TransactionType, PaymentMethod, StatementResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function processStatement(fileBase64: string, mimeType: string): Promise<StatementResult> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType
            }
          },
          {
            text: `Analise este extrato bancário e extraia as informações em formato JSON. 
            Identifique PRIMEIRO os dados do titular do extrato (a empresa dona da conta):
            - Razão Social (ownerName)
            - CNPJ (ownerCnpj)
            - Instituição Bancária (ownerBank)
            
            Depois, extraia a lista de transações com MÁXIMA PRECISÃO:
            - Data e Horário completos (ISO 8601 incluindo obrigatoriamente horas, minutos e segundos: YYYY-MM-DDTHH:mm:ss)
            - Descrição original
            - Valor (numérico positivo)
            - Tipo (entrada ou saída)
            - Nome da contraparte (empresa favorecida ou pagadora)
            - CNPJ da contraparte (se disponível)
            - Método de pagamento (PIX, TED, BOLETO, CARTÃO, OUTROS)
            - Nome do pagador (quem enviou o dinheiro)
            - Origem: Identifique a origem da transação (ex: Venda Online, Loja Física, Tarifa Bancária)
            - Banco: Identifique o nome da instituição financeira da transação específica
            
            Retorne um objeto JSON com 'ownerName', 'ownerCnpj', 'ownerBank' e um array 'transactions'.`
          }
        ]
      }
    ],
    config: {
      // responseMimeType is required for JSON mode
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
                type: { type: Type.STRING, enum: ['entrada', 'saída'] },
                counterpartyName: { type: Type.STRING },
                counterpartyCnpj: { type: Type.STRING },
                paymentMethod: { type: Type.STRING, enum: ['PIX', 'TED', 'BOLETO', 'CARTÃO', 'OUTROS'] },
                payerName: { type: Type.STRING },
                origin: { type: Type.STRING },
                payingBank: { type: Type.STRING }
              },
              required: ['date', 'amount', 'type', 'description', 'origin', 'payingBank']
            }
          }
        },
        required: ['ownerName', 'ownerCnpj', 'ownerBank', 'transactions']
      }
    }
  });

  const rawData = JSON.parse(response.text || "{}");
  const ownerName = rawData.ownerName || 'Empresa não identificada';
  const ownerCnpj = rawData.ownerCnpj || 'CNPJ não identificado';
  const ownerBank = rawData.ownerBank || 'Banco não identificado';
  
  return {
    ownerName,
    ownerCnpj,
    ownerBank,
    transactions: (rawData.transactions || []).map((item: any, index: number) => ({
      id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      date: item.date,
      description: item.description,
      amount: item.amount,
      type: item.type as TransactionType,
      counterpartyName: item.counterpartyName || 'Desconhecido',
      counterpartyCnpj: item.counterpartyCnpj || '',
      paymentMethod: item.paymentMethod as PaymentMethod,
      payerName: item.payerName || 'Própria Empresa',
      origin: item.origin || 'Não identificado',
      payingBank: item.payingBank || 'Instituição não informada',
      notes: '', // Sempre vazio conforme solicitado para preenchimento manual
      ownerName,
      ownerCnpj,
      ownerBank
    }))
  };
}