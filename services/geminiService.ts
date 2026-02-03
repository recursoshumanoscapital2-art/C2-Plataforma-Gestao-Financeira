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
            text: "Extraia todas as transações deste extrato. Retorne APENAS o JSON conforme o schema, sem explicações extras. Se houver muitas páginas, certifique-se de listar todas as movimentações de forma ultra-concisa."
          }
        ]
      },
      config: {
        maxOutputTokens: 15000,
        temperature: 0.1, // Menor temperatura para maior precisão e menor verbosidade
        thinkingConfig: { thinkingBudget: 0 },
        systemInstruction: `Você é um extrator de dados contábeis. Sua missão é converter extratos bancários (PDF/Imagem) em JSON puro.
            
            REGRAS CRÍTICAS DE ECONOMIA DE TOKENS:
            1. NÃO adicione campos que não estão no schema.
            2. NÃO repita nomes de bancos ou do titular em cada item da lista (use os campos de topo do objeto).
            3. Seja ultra-objetivo nas descrições ('desc') e nomes de favorecidos ('party').
            
            BANCO DO BRASIL:
            - Valores em VERMELHO são Saídas (type: "saída").
            - Valores em AZUL são Entradas (type: "entrada").
            - Descrição "INVEST. RESGATE AUTOM." é sempre "entrada".
            
            SCHEMA:
            - ownerName: Razão Social.
            - ownerCnpj: CNPJ se houver, ou string vazia.
            - ownerBank: Nome do Banco.
            - transactions: Lista de objetos com date (ISO), desc (descrição curta), val (número absoluto), type ("entrada" ou "saída"), party (favorecido), method (PIX, TED, BOLETO, CARTÃO, OUTROS), cat (categoria curta).`,
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
                  party: { type: Type.STRING },
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

    let jsonStr = response.text?.trim() ?? "";
    
    // Fallback agressivo para limpar markdown se o modelo ignorar o mimeType: application/json
    if (jsonStr.includes('```')) {
      const match = jsonStr.match(/```(?:json)?([\s\S]*?)```/);
      if (match && match[1]) {
        jsonStr = match[1].trim();
      }
    }

    if (!jsonStr) {
      throw new Error("O modelo retornou uma resposta vazia.");
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
      console.error("JSON inválido recebido:", jsonStr);
      // Se o erro for de parsing, provavelmente o JSON foi truncado por ser muito longo
      throw new Error("O extrato é muito longo ou complexo para ser processado em um único lote. Tente importar menos páginas por vez ou divida o arquivo.");
    }
  });
}
