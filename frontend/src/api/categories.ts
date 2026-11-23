import { apiGet, apiRequest } from './client';
import type { Category, CategoryDetail, CategorySummary } from '../types/category';

export interface CategoryInput {
  name: string;
  icon?: string | null;
  color?: string | null;
  parent_category_id?: number | null;
}

/** GET /categories — 건수·합계 요약이 포함된 카테고리 목록 */
export function getCategories(signal?: AbortSignal): Promise<CategorySummary[]> {
  return apiGet<CategorySummary[]>('/categories', undefined, signal);
}

/** POST /categories — 카테고리 생성 */
export function createCategory(payload: CategoryInput): Promise<Category> {
  return apiRequest<Category>('POST', '/categories', { body: payload });
}

/** GET /categories/{id} — 카테고리 + 그 안의 거래 목록 */
export function getCategoryDetail(id: number, signal?: AbortSignal): Promise<CategoryDetail> {
  return apiGet<CategoryDetail>(`/categories/${id}`, undefined, signal);
}

/** PATCH /categories/{id} — 카테고리 이름/아이콘/색상/상위 카테고리 수정 */
export function updateCategory(id: number, payload: Partial<CategoryInput>): Promise<Category> {
  return apiRequest<Category>('PATCH', `/categories/${id}`, { body: payload });
}

/** DELETE /categories/{id} — 거래가 연결되지 않은 카테고리 삭제 */
export function deleteCategory(id: number): Promise<void> {
  return apiRequest<void>('DELETE', `/categories/${id}`);
}

/** PATCH /categories/{id}/archive — 보관(마감) */
export function archiveCategory(id: number): Promise<Category> {
  return apiRequest<Category>('PATCH', `/categories/${id}/archive`);
}

/** PATCH /categories/{id}/unarchive — 보관 해제 */
export function unarchiveCategory(id: number): Promise<Category> {
  return apiRequest<Category>('PATCH', `/categories/${id}/unarchive`);
}
