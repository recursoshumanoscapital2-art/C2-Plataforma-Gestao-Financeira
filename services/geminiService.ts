
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TransactionType, PaymentMethod, StatementResult } from "../types";

export async function processStatement(fileBase64: string, mimeType: string): Promise<StatementResult> {
  // Always initialize GoogleGenAI with a named parameter using process.env.API_KEY directly.
  // The API key is assumed to be pre-configured in the environment.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Use 'gemini-3-pro-preview' for complex text tasks like financial data extraction and advanced reasoning.
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: {
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
    },
    config: {
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
                date: { type: Type.STRING, description: 'ISO 8601 string including time' },
                description: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                type: { type: Type.STRING, description: 'Must be either "entrada" or "saída"' },
                counterpartyName: { type: Type.STRING },
                counterpartyCnpj: { type: Type.STRING },
                paymentMethod: { type: Type.STRING, description: 'One of: PIX, TED, BOLETO, CARTÃO, OUTROS' },
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

  // Access the text content directly using the .text property (not a method).
  // The response is already validated by the responseSchema above.
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
      notes: '', 
      ownerName,
      ownerCnpj,
      ownerBank
    }))
  };
}
