import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Transaction, TransactionType, PaymentMethod, StatementResult } from "../types";

// Inicializa o SDK com a variável que você configurou no Render
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");

export async function processStatement(fileBase64: string, mimeType: string): Promise<StatementResult> {
  
  // Seleciona o modelo (1.5-flash é excelente para JSON e extratos)
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: {
      responseMimeType: "application/json",
      // Definindo o esquema para garantir que a IA não invente campos
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
    systemInstruction: `Você é um especialista em contabilidade brasileira. 
    Sua tarefa é converter extratos bancários em JSON puro.
    REGRAS:
    1. amount: Sempre número positivo.
    2. type: Use apenas "entrada" ou "saída".
    3. date: Formato YYYY-MM-DD.
    4. Se não encontrar CNPJ, retorne "".`
  });

  const prompt = "Analise o extrato bancário anexo e extraia todos os dados solicitados no formato JSON.";

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: fileBase64
        }
      },
      { text: prompt }
    ]);

    const response = await result.response;
    const rawData = JSON.parse(response.text());

    const ownerName = rawData.ownerName || 'Não identificado';
    const ownerBank = rawData.ownerBank || 'Não identificado';

    // Mapeia os dados da IA para o formato da sua aplicação
    return {
      ownerName,
      ownerCnpj: rawData.ownerCnpj || '',
      ownerBank,
      transactions: (rawData.transactions || []).map((item: any, index: number) => ({
        id: `${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`,
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
    console.error("Erro no processamento Gemini:", error);
    throw new Error("Falha ao processar o extrato com Gemini.");
  }
}
