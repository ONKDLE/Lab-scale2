export type BudgetStatus = 'NO_BUDGET' | 'NORMAL' | 'WARNING' | 'OVER';

export interface BudgetSummary {
  month: string;
  limit_amount: string;
  total_expense: string;
  usage_rate: number;
  remaining_amount: string;
  status: BudgetStatus;
}
