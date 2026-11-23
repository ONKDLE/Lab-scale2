import { apiRequest, apiGet } from './client';
import type { BudgetSummary } from '../types/budget';

export function getMonthlyBudget(month: string, signal?: AbortSignal): Promise<BudgetSummary> {
  return apiGet<BudgetSummary>('/budget/monthly', { month }, signal);
}

export function setMonthlyBudget(month: string, limitAmount: string): Promise<BudgetSummary> {
  return apiRequest<BudgetSummary>('PUT', '/budget/monthly', {
    body: { month, limit_amount: limitAmount },
  });
}
