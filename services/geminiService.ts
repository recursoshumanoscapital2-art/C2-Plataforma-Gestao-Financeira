import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Transaction, TransactionType, PaymentMethod, StatementResult } from "../types";

// Usamos (import.meta as any) para evitar que o TypeScript reclame durante o build
const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function processStatement(fileBase64: string, mimeType: string): Promise<StatementResult> {
  
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          ownerName: { type: SchemaType.STRING },
          ownerCnpj: { type: SchemaType.STRING },
          ownerBank: { type: SchemaType.STRING },
          transactions: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                date: { type: SchemaType.STRING },
                description: { type: SchemaType.STRING },
                amount: { type: SchemaType.NUMBER },
                type: { type: SchemaType.STRING },
                counterpartyName: { type: SchemaType.STRING },
                paymentMethod: { type: SchemaType.STRING },
                origin: { type: SchemaType.STRING },
                payingBank: { type: SchemaType.STRING }
              },
              required: ["date", "amount", "type", "description"]
            }
          }
        },
        required: ["ownerName", "ownerCnpj", "ownerBank", "transactions"]
      }
    },
    systemInstruction: `Você é um especialista em contabilidade brasileira. Extraia os dados do extrato para JSON.`
  });

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType: mimeType, data: fileBase64 } },
      { text: "Extraia os dados deste extrato bancário." }
    ]);

    const response = await result.response;
    const rawData = JSON.parse(response.text());

    const ownerName = rawData.ownerName || 'Não identificado';
    const ownerBank = rawData.ownerBank || 'Não identificado';

    return {
      ownerName,
      ownerCnpj: rawData.ownerCnpj || '',
      ownerBank,
      transactions: (rawData.transactions || []).map((item: any, index: number) => ({
        id: `${Date.now()}-${index}`,
        date: item.date || new Date().toISOString(),
        description: item.description || 'Sem descrição',
        amount: item.amount || 0,
        type: item.type === 'entrada' ? TransactionType.INFLOW : TransactionType.OUTFLOW,
        counterpartyName: item.counterpartyName || 'Não identificado',
        paymentMethod: (item.paymentMethod as PaymentMethod) || PaymentMethod.OUTROS,
        payerName: item.type === 'saída' ? ownerName : (item.counterpartyName || 'Terceiro'),
        origin: item.origin || 'Extração IA',
        payingBank: item.payingBank || ownerBank,
        notes: '',
        ownerName,
        ownerCnpj: rawData.ownerCnpj || '',
        ownerBank
      }))
    };
  } catch (error) {
    console.error("Erro Gemini:", error);
    throw error;
  }
}
