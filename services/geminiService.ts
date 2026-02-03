// Use the recommended import syntax for GoogleGenAI and Type
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TransactionType, PaymentMethod, StatementResult } from "../types";

/**
 * Função auxiliar para executar chamadas com repetição automática em caso de erro 503 ou 429.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4, initialDelay = 3000): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Verifica se é erro de cota (429) ou sobrecarga (503)
      const isQuotaError = error.status === 429 || error.message?.includes("429") || error.message?.includes("QUOTA_EXHAUSTED") || error.message?.includes("RESOURCE_EXHAUSTED");
      const isOverloadError = error.status === 503 || error.message?.includes("503") || error.message?.includes("overloaded");

      if ((isQuotaError || isOverloadError) && i < maxRetries) {
        // Se for erro de cota (429), precisamos de um delay maior (backoff exponencial mais agressivo)
        const multiplier = isQuotaError ? 10 : 2; 
        const delay = initialDelay * Math.pow(multiplier, i);
        
        console.warn(`Aviso: Limite de cota ou sobrecarga atingido. Tentativa ${i + 1}/${maxRetries}. Aguardando ${Math.round(delay/1000)}s antes de tentar novamente...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function processStatement(fileBase64: string, mimeType: string): Promise<StatementResult> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("A variável de ambiente API_KEY não está configurada.");
  }
  
  const ai = new GoogleGenAI({apiKey: apiKey});

  return withRetry(async () => {
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
            text: "Extraia TODAS as transações deste extrato. Seja exaustivo e não pule nenhuma linha de movimentação financeira."
          }
        ]
      },
      config: {
        maxOutputTokens: 15000,
        thinkingConfig: { thinkingBudget: 0 },
        systemInstruction: `Você é um robô de extração de dados contábeis de alta precisão.
            Converta extratos bancários para JSON. 
            
            REGRAS DE ECONOMIA DE TOKENS (CRÍTICO):
            1. No array 'transactions', NÃO repita informações do dono da conta ou do banco emissor.
            2. Extraia apenas o essencial de cada linha para manter o JSON conciso.
            
            ESPECÍFICO PARA BANCO DO BRASIL:
            - Identifique visualmente que valores na cor VERMELHA são Saídas (type: "saída").
            - Identifique visualmente que valores na cor AZUL são Entradas (type: "entrada").
            - A transação com a descrição "INVEST. RESGATE AUTOM." deve ser SEMPRE classificada como "entrada".
            
            INSTRUÇÕES DE CAMPOS:
            - ownerName: Razão Social/Titular da conta.
            - ownerCnpj: APENAS se escrito 'CNPJ' no texto. Se não, deixe "".
            - ownerBank: Nome do banco (ex: Itaú, Bradesco, Banco do Brasil).
            - transactions: Lista de todas as movimentações.
            - date: ISO 8601 (YYYY-MM-DDTHH:mm:ss).
            - type: "entrada" (crédito) ou "saída" (débito).
            - method: Classifique em PIX, TED, BOLETO, CARTÃO ou OUTROS.
            - category: Breve descrição da origem (Venda, Tarifa, Imposto, etc).`,
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
                  desc: { type: Type.STRING },
                  val: { type: Type.NUMBER },
                  type: { type: Type.STRING },
                  party: { type: Type.STRING, description: "Nome da contraparte ou favorecido" },
                  method: { type: Type.STRING },
                  cat: { type: Type.STRING }
                },
                required: ['date', 'val', 'type', 'desc']
              }
            }
          },
          required: ['ownerName', 'ownerCnpj', 'ownerBank', 'transactions']
        }
      }
    });

    let jsonStr = response.text?.trim() ?? "{}";
    
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    try {
      const rawData = JSON.parse(jsonStr);
      
      const ownerName = rawData.ownerName || 'Empresa não identificada';
      const ownerCnpj = rawData.ownerCnpj || '';
      const ownerBank = rawData.ownerBank || 'Banco não identificado';
      
      return {
        ownerName,
        ownerCnpj,
        ownerBank,
        transactions: (rawData.transactions || []).map((item: any, index: number) => ({
          id: `${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
          date: item.date || new Date().toISOString(),
          description: item.desc || 'Sem descrição',
          amount: Math.abs(item.val || 0),
          type: item.type === 'entrada' ? TransactionType.INFLOW : TransactionType.OUTFLOW,
          counterpartyName: item.party || 'Não identificado',
          counterpartyCnpj: '',
          paymentMethod: (item.method as PaymentMethod) || PaymentMethod.OUTROS,
          payerName: item.type === 'saída' ? ownerName : (item.party || 'Terceiro'),
          origin: item.cat || 'Extração IA',
          payingBank: ownerBank,
          notes: '', 
          ownerName,
          ownerCnpj,
          ownerBank
        }))
      };
    } catch (parseError) {
      console.error("Erro ao parsear JSON:", jsonStr);
      throw new Error("A resposta da IA veio incompleta. O arquivo pode ser muito grande ou complexo.");
    }
  });
}
