export interface StatsCategory {
  category_id: number | null;
  category_name: string;
  color: string | null;
  amount: string;
  ratio: number;
  transaction_count: number;
}

export interface StatsMonth {
  month: string;
  total_expense: string;
  total_income: string;
  net_amount: string;
  transaction_count: number;
  categories: StatsCategory[];
  top_category_name: string | null;
}

export interface MonthlyStats {
  month: string;
  previous_month: string;
  current: StatsMonth;
  previous: StatsMonth;
  trend: { month: string; total_income: string; total_expense: string }[];
  income_supported: boolean;
}
