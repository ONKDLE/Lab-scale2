import { apiGet, apiRequest } from './client';
import type { Category, CategoryDetail, CategorySummary } from '../types/category';

/** GET /categories — 건수·합계 요약이 포함된 카테고리 목록 */
export function getCategories(signal?: AbortSignal): Promise<CategorySummary[]> {
  return apiGet<CategorySummary[]>('/categories', undefined, signal);
}

/** GET /categories/{id} — 카테고리 + 그 안의 거래 목록 (6주차 묶음 조회) */
export function getCategoryDetail(id: number, signal?: AbortSignal): Promise<CategoryDetail> {
  return apiGet<CategoryDetail>(`/categories/${id}`, undefined, signal);
}

/** PATCH /categories/{id}/archive — 보관(마감) */
export function archiveCategory(id: number): Promise<Category> {
  return apiRequest<Category>('PATCH', `/categories/${id}/archive`);
}

/** PATCH /categories/{id}/unarchive — 보관 해제 */
export function unarchiveCategory(id: number): Promise<Category> {
  return apiRequest<Category>('PATCH', `/categories/${id}/unarchive`);
}
