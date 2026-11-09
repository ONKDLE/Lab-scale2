// 백엔드 응답(schemas.py의 CategoryOut / CategorySummaryOut / CategoryDetailOut)과 모양을 맞춘 타입.
import type { Transaction } from './transaction';

export type CategoryStatus = 'ACTIVE' | 'ARCHIVED';

export interface Category {
  id: number;
  user_id: number;
  name: string;
  icon: string | null;
  color: string | null;
  parent_category_id: number | null;
  status: CategoryStatus;
}

/** 목록에서 쓰는 요약. 건수와 합계는 '정상' 거래만 센다 (total_amount는 "15634.56" 같은 문자열). */
export interface CategorySummary extends Category {
  transaction_count: number;
  total_amount: string;
}

/** 상세: 요약 + 그 카테고리의 거래 전체 (취소된 거래 포함) */
export interface CategoryDetail extends CategorySummary {
  transactions: Transaction[];
}
