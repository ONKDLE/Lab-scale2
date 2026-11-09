import { apiGet, apiRequest } from './client';
import type { Transaction, TransactionPage, TransactionStatus } from '../types/transaction';

export interface TransactionListParams {
  page?: number;
  size?: number;
  status?: TransactionStatus;
  keyword?: string;
  sort?: string; // 예: "amount,asc" (안 보내면 백엔드 기본값: 거래일 최신순)
}

/** GET /transactions — 페이지 나누기, 상태 필터, 키워드 검색이 적용된 거래 목록 */
export function getTransactionList(
  { page, size, status, keyword, sort }: TransactionListParams,
  signal?: AbortSignal,
): Promise<TransactionPage> {
  return apiGet<TransactionPage>(
    '/transactions',
    { page, size, status, keyword: keyword?.trim(), sort },
    signal,
  );
}

/** PATCH /transactions/{id}/cancel — 거래 취소 */
export function cancelTransaction(id: number): Promise<Transaction> {
  return apiRequest<Transaction>('PATCH', `/transactions/${id}/cancel`);
}

/** PATCH /transactions/{id}/restore — 취소한 거래 복구 */
export function restoreTransaction(id: number): Promise<Transaction> {
  return apiRequest<Transaction>('PATCH', `/transactions/${id}/restore`);
}
