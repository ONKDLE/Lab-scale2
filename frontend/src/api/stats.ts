import { apiGet } from './client';
import type { MonthlyStats } from '../types/stats';

export function getMonthlyStats(month: string, signal?: AbortSignal): Promise<MonthlyStats> {
  return apiGet<MonthlyStats>('/stats/monthly', { month }, signal);
}
