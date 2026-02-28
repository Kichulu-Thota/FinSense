import { GoogleGenAI, Type, Modality, ThinkingLevel } from "@google/genai";
import { Transaction, Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function processFinancialInput(
  input: string, 
  language: string = "English", 
  history: Message[] = [],
  businessContext: string = "Small Business",
  inventoryContext: string = ""
): Promise<{
  status: 'SUCCESS' | 'NEEDS_CLARIFICATION' | 'AMBIGUOUS';
  transactions: Transaction[];
  explanation: string;
  clarification_question?: string;
  confidence: number;
}> {
  const model = "gemini-3-flash-preview";
  
  const recentHistory = history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');

  const prompt = `
    You are an Autonomous Financial Capture System with an AI reasoning layer for a small business (${businessContext}).
    Current Date: ${new Date().toISOString().split('T')[0]}
    
    IMPORTANT: The user has selected ${language} as preferred language. Respond strictly in ${language}.
    
    CRITICAL ACCOUNTING RULES (Handle these anomalies):
    1. OPENING BALANCE: If user says "I started with X", ask if it's opening balance or new capital. Categorize as 'capital'.
    2. AMBIGUOUS EXPENSE: If user says "Spent X", ask for purpose and if it's business or personal.
    3. PERSONAL EXPENSE: Categorize personal items (e.g., "school bag for son") with is_personal: true.
    4. CREDIT SALES: If "on credit", set payment_status: 'credit' and amount_paid: 0.
    5. PARTIAL PAYMENT: If "Sold for 1000, paid 500", set amount: 1000, amount_paid: 500, payment_status: 'partial'.
    6. MULTI-TRANSACTION: Extract all items from messages like "Bought X and Y and sold Z".
    7. QUANTITY LOGIC: Always try to extract quantity. If missing for inventory items, ask "How many?".
    8. CURRENCY: Default is INR (₹). If other currency mentioned, ask for conversion or reject.
    9. REVERSAL: If user says "Last sale was wrong", set status to 'AMBIGUOUS' and ask to confirm deletion of the last transaction from history.
    10. DUPLICATES: Check history. If same message repeated, ask "Is this a duplicate?".
    11. BACKDATING: If "Yesterday", use the date ${new Date(Date.now() - 86400000).toISOString().split('T')[0]}.
    12. MIXED LANGUAGE: Support mixed language (e.g., "20 puffs sold chesanu").
    13. INVENTORY: If usage exceeds known stock (check history), warn about negative inventory.
    14. RANDOM CHAT: If no financial intent, respond conversationally with status: 'AMBIGUOUS'.
    15. CAPITAL INJECTION: Categorize as 'capital' (e.g., "Brother gave 20000").
    16. LOANS: Categorize as 'loan' (e.g., "Took loan from bank").
    17. REFUNDS: Categorize as 'refund' (e.g., "Got refund from supplier").
    18. UNIT PRICE AMBIGUITY: If user says "Sold 10 for 500", you MUST determine if 500 is 'total' or 'per unit'. If unclear, ask "Is ₹500 the total price or price for each item?".
    19. MATH EXTRAPOLATION: If user says "Paid 50000 for 45 out of 60 items", calculate the unit price (50000/45), then the total amount (unit_price * 60), and set amount_paid: 50000. Do NOT ask for the total if it can be mathematically derived from a rate.
    20. CALCULATOR LOGIC: If user provides a calculation like "10 items at 50 each plus 5 items at 100 each", extract two separate transactions or one combined transaction with the correct total (1000).
    21. FRAUD/VALIDATION: Reject negative amounts or impossible logic.
    22. CASH VS REVENUE: Ensure amount_paid correctly reflects cash flow, while amount reflects revenue/expense.
    23. COUNTERPARTY: If user mentions a person or company (e.g., "Sold to Rahul", "Bought from Amazon"), extract their name as 'counterparty' and any contact info (phone/email) as 'counterparty_contact'.
    24. INVENTORY CONTEXT: Use the provided inventory context (if any) to validate item names and categories.
    
    Inventory Context:
    ${inventoryContext}

    History:
    ${recentHistory}
    
    User Input: "${input}"
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING, enum: ["SUCCESS", "NEEDS_CLARIFICATION", "AMBIGUOUS"] },
          transactions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ["revenue", "expense", "capital", "loan", "refund"] },
                category: { type: Type.STRING },
                item: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                quantity: { type: Type.NUMBER },
                unit_price: { type: Type.NUMBER },
                payment_status: { type: Type.STRING, enum: ["paid", "credit", "partial"] },
                amount_paid: { type: Type.NUMBER },
                counterparty: { type: Type.STRING },
                counterparty_contact: { type: Type.STRING },
                date: { type: Type.STRING },
                is_personal: { type: Type.BOOLEAN }
              },
              required: ["type", "category", "item", "amount", "date", "is_personal", "payment_status", "amount_paid"]
            }
          },
          explanation: { type: Type.STRING },
          clarification_question: { type: Type.STRING },
          confidence: { type: Type.NUMBER }
        },
        required: ["status", "explanation", "confidence"]
      }
    }
  });

  return JSON.parse(response.text);
}

export async function generateFinancialInsight(
  stats: any, 
  recentTransactions: Transaction[], 
  language: string = "English"
): Promise<{ insight: string; severity: 'low' | 'medium' | 'high' }> {
  const model = "gemini-3-flash-preview";
  
  // Check for data significance
  if (recentTransactions.length < 5) {
    return { 
      insight: "I'm still learning your business patterns. Keep logging for 1-2 more days to get insights.", 
      severity: 'low' 
    };
  }

  const prompt = `
    You are a conservative AI CFO. Analyze the data and provide ONE actionable insight.
    
    IMPORTANT: The user has selected ${language} as their preferred language.
    You MUST provide the insight strictly in ${language}.
    
    RULES:
    1. RESPOND IN ${language}. The insight MUST be in ${language}.
    2. USE RUPEES (₹). Use the ₹ symbol for all currency mentions.
    3. Avoid overreacting to small data.
    4. Consider seasonality (weekends vs weekdays).
    5. Prioritize severity (Cash runway < 7 days is HIGH).
    6. Language: ${language}.
    
    Stats: ${JSON.stringify(stats)}
    Recent Transactions: ${JSON.stringify(recentTransactions.slice(0, 10))}
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          insight: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["low", "medium", "high"] }
        },
        required: ["insight", "severity"]
      }
    }
  });

  return JSON.parse(response.text);
}

export async function generateSpeech(text: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (err: any) {
    if (err?.message?.includes('quota') || err?.status === 'RESOURCE_EXHAUSTED') {
      console.warn("TTS Quota exceeded. Audio feedback disabled.");
    } else {
      console.error("TTS Error:", err);
    }
    return null;
  }
}
