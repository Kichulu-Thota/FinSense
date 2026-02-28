export interface Transaction {
  id?: number;
  type: 'revenue' | 'expense' | 'capital' | 'loan' | 'refund';
  category: string;
  item: string;
  amount: number;
  quantity?: number;
  unit_price?: number;
  currency: string;
  date: string;
  payment_status: 'paid' | 'credit' | 'partial';
  amount_paid: number;
  counterparty?: string;
  counterparty_contact?: string;
  is_personal: boolean;
  raw_text?: string;
  status: 'confirmed' | 'deleted' | 'voided';
  created_at?: string;
  updated_at?: string;
}

export interface Stats {
  total_revenue: number;
  total_expenses: number;
  total_personal: number;
  accounts_receivable: number;
  accounts_payable: number;
  cash_balance: number;
  recentTrend: { date: string; net: number }[];
}

export interface Reconciliation {
  id?: number;
  date: string;
  system_balance: number;
  physical_balance: number;
  variance: number;
  notes?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  transactions?: Transaction[];
  insight?: { insight: string; severity: 'low' | 'medium' | 'high' };
  status?: 'SUCCESS' | 'NEEDS_CLARIFICATION' | 'AMBIGUOUS';
  clarification_question?: string;
  timestamp: Date;
}
