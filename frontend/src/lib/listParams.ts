// 주소창 쿼리스트링(?page=2&status=ACTIVE&keyword=스타벅스) <-> 화면 상태 변환.
// 주소창은 사용자가 직접 고칠 수도 있으므로, 이상한 값은 안전한 기본값으로 바꿔서 쓴다.
import type { TransactionStatus } from '../types/transaction';

export interface ListState {
  page: number;
  status?: TransactionStatus;
  keyword: string;
}

/** 1 이상의 정수만 인정한다. 그 외(없음, abc, 0, 음수, 1.5)는 1페이지. */
export function parsePage(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return 1;
  const value = Number(raw);
  return value >= 1 && Number.isSafeInteger(value) ? value : 1;
}

/** ACTIVE, CANCELLED만 인정한다. 그 외는 "전체"(undefined). */
export function parseStatus(raw: string | null): TransactionStatus | undefined {
  return raw === 'ACTIVE' || raw === 'CANCELLED' ? raw : undefined;
}

export function parseListState(searchParams: URLSearchParams): ListState {
  return {
    page: parsePage(searchParams.get('page')),
    status: parseStatus(searchParams.get('status')),
    keyword: (searchParams.get('keyword') ?? '').trim(),
  };
}

/** 화면 상태 -> 쿼리스트링. 기본값(1페이지, 전체, 검색어 없음)은 주소에 적지 않는다. */
export function toSearchParams({ page, status, keyword }: ListState): URLSearchParams {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (status) params.set('status', status);
  if (keyword) params.set('keyword', keyword);
  return params;
}
