// 테스트 공용 도구: 가짜 서버(fetch) 만들기, 테스트용 데이터 만들기, 주소창 확인용 컴포넌트.
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import TransactionListPage from '../pages/TransactionListPage';
import type { Category } from '../types/category';
import type { Transaction, TransactionPage } from '../types/transaction';

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    user_id: 1,
    category_id: 1,
    merchant_name: '스타벅스 양산점',
    amount: '4500.00',
    transaction_date: '2026-09-01',
    source_bank: '국민은행',
    status: 'ACTIVE',
    ...overrides,
  };
}

export function makePage(overrides: Partial<TransactionPage> = {}): TransactionPage {
  return {
    items: [makeTransaction()],
    page: 1,
    size: 10,
    total_elements: 1,
    total_pages: 1,
    has_next: false,
    ...overrides,
  };
}

export const CATEGORIES: Category[] = [
  { id: 1, user_id: 1, name: '카페', icon: null, color: '#4472C4', parent_category_id: null, status: 'ACTIVE' },
];

export interface MockResult {
  status?: number;
  body: unknown;
}
export type MockHandler = (url: URL, init?: RequestInit) => MockResult | 'network-error' | Promise<MockResult | 'network-error'>;

/** fetch를 가짜로 바꿔서, 주소(URL)에 따라 원하는 응답을 돌려준다. 실제 서버에는 접속하지 않는다. */
export function mockFetch(handler: MockHandler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const result = await handler(url, init);
    if (result === 'network-error') throw new TypeError('Failed to fetch');
    const status = result.status ?? 200;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(result.body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 카테고리 요청은 고정 응답, 거래 목록 요청은 전달한 함수로 처리하는 핸들러. */
export function apiHandler(onTransactions: (url: URL) => MockResult | 'network-error' | Promise<MockResult | 'network-error'>): MockHandler {
  return (url) => (url.pathname === '/categories' ? { body: CATEGORIES } : onTransactions(url));
}

/** fetch 호출 중 거래 목록(/transactions) 요청 주소만 순서대로 꺼낸다. */
export function transactionCalls(fetchMock: ReturnType<typeof mockFetch>): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(typeof input === 'string' ? input : input.toString()))
    .filter((url) => url.pathname === '/transactions');
}

/** 나중에 직접 결과를 넣어줄 수 있는 Promise (느린 서버 흉내). */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** 현재 주소창(경로 + 쿼리스트링)을 화면에 찍어두는 컴포넌트. */
export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

export function renderPage(entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TransactionListPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}
