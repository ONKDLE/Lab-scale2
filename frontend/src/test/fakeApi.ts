// 테스트용 "가짜 백엔드". 실제 서버처럼 로그인, 카테고리, 거래 취소/복구를 기억하면서 응답한다.
// 그래서 "취소하면 목록의 합계가 줄어드는지" 같은 흐름 전체를 검사할 수 있다.
import { summarizeActive } from '../lib/money';
import type { Category, CategoryDetail, CategorySummary } from '../types/category';
import type { Transaction } from '../types/transaction';
import { makeTransaction, type MockHandler, type MockResult } from './helpers';

interface FakeUser {
  id: number;
  email: string;
  password: string;
}

export interface FakeDb {
  users: FakeUser[];
  categories: Category[];
  transactions: Transaction[];
}

export interface CallLog {
  method: string;
  path: string;
  body: string | undefined;
  headers: Headers;
}

type Result = MockResult | 'network-error';

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    user_id: 1,
    name: '카페',
    icon: null,
    color: '#4472C4',
    parent_category_id: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

/** 기본 데이터: 사용자 1의 카페(거래 3건, 1건은 취소됨), 보관된 구독, 빈 교통 / 사용자 2의 카테고리 하나 */
export function defaultDb(): FakeDb {
  return {
    users: [
      { id: 1, email: 'test@mypin.dev', password: 'mypin1234' },
      { id: 2, email: 'other@mypin.dev', password: 'mypin1234' },
    ],
    categories: [
      makeCategory({ id: 1, name: '카페' }),
      makeCategory({ id: 2, name: '구독', color: '#ED7D31', status: 'ARCHIVED' }),
      makeCategory({ id: 3, name: '교통', color: '#2E9E6B' }),
      makeCategory({ id: 9, user_id: 2, name: '타인의 카테고리' }),
    ],
    transactions: [
      makeTransaction({ id: 1, category_id: 1, merchant_name: '스타벅스 양산점', amount: '4400.00', transaction_date: '2026-10-30' }),
      makeTransaction({ id: 2, category_id: 1, merchant_name: '오엑스피시방', amount: '10000.00', transaction_date: '2026-10-29' }),
      makeTransaction({ id: 3, category_id: 1, merchant_name: '하이비스PC', amount: '10000.00', transaction_date: '2026-10-28', status: 'CANCELLED' }),
      makeTransaction({ id: 4, category_id: 2, merchant_name: '넷플릭스', amount: '17000.00', transaction_date: '2026-10-20' }),
      makeTransaction({ id: 5, user_id: 2, category_id: 9, merchant_name: '타인의 거래', amount: '1000.00' }),
    ],
  };
}

export const tokenFor = (userId: number) => `token-${userId}`;

export function createFakeApi(db: FakeDb = defaultDb()) {
  const calls: CallLog[] = [];
  const failures: { method: string; pattern: RegExp; result: Result }[] = [];
  const holds: { method: string; pattern: RegExp; promise: Promise<void> }[] = [];

  const tokenUserId = (headers: Headers): number | null => {
    const match = headers.get('Authorization')?.match(/^Bearer token-(\d+)$/);
    return match ? Number(match[1]) : null;
  };
  const notFound = (what: string): MockResult => ({ status: 404, body: { detail: `${what}를 찾을 수 없습니다.` } });

  const summaryOf = (category: Category): CategorySummary => {
    const { count, total } = summarizeActive(db.transactions.filter((t) => t.category_id === category.id));
    return { ...category, transaction_count: count, total_amount: total };
  };

  const handler: MockHandler = async (url, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname;
    const headers = new Headers(init?.headers);
    calls.push({ method, path, body: typeof init?.body === 'string' ? init.body : undefined, headers });

    const hold = holds.find((h) => h.method === method && h.pattern.test(path));
    if (hold) {
      holds.splice(holds.indexOf(hold), 1);
      await hold.promise;
    }
    const failure = failures.findIndex((f) => f.method === method && f.pattern.test(path));
    if (failure >= 0) return failures.splice(failure, 1)[0].result;

    // ---- 로그인 / 가입 (토큰 없이 호출)
    if (method === 'POST' && path === '/auth/login') {
      const form = new URLSearchParams(String(init?.body ?? ''));
      const user = db.users.find((u) => u.email === form.get('username') && u.password === form.get('password'));
      return user
        ? { body: { access_token: tokenFor(user.id), token_type: 'bearer' } }
        : { status: 401, body: { detail: '이메일 또는 비밀번호가 올바르지 않습니다.' } };
    }
    if (method === 'POST' && path === '/auth/register') {
      const { email, password } = JSON.parse(String(init?.body));
      if (db.users.some((u) => u.email === email)) return { status: 409, body: { detail: '이미 가입된 이메일입니다.' } };
      const user = { id: Math.max(...db.users.map((u) => u.id)) + 1, email, password };
      db.users.push(user);
      return { status: 201, body: { id: user.id, email } };
    }

    // ---- 여기부터는 로그인(토큰)이 필요하다
    const userId = tokenUserId(headers);
    if (userId === null || !db.users.some((u) => u.id === userId)) {
      return { status: 401, body: { detail: '로그인이 필요합니다.' } };
    }

    if (method === 'GET' && path === '/auth/me') {
      const user = db.users.find((u) => u.id === userId)!;
      return { body: { id: user.id, email: user.email } };
    }

    if (method === 'GET' && path === '/categories') {
      return { body: db.categories.filter((c) => c.user_id === userId).map(summaryOf) };
    }

    const categoryMatch = path.match(/^\/categories\/(\d+)(?:\/(archive|unarchive))?$/);
    if (categoryMatch) {
      const category = db.categories.find((c) => c.id === Number(categoryMatch[1]));
      const action = categoryMatch[2];
      if (method === 'GET' && !action) {
        // 남의 카테고리는 "없는 것"처럼 404 (백엔드와 같은 동작)
        if (!category || category.user_id !== userId) return notFound('카테고리');
        const detail: CategoryDetail = {
          ...summaryOf(category),
          transactions: db.transactions
            .filter((t) => t.category_id === category.id)
            .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id),
        };
        return { body: detail };
      }
      if (method === 'PATCH' && action) {
        if (!category) return notFound('카테고리');
        if (category.user_id !== userId) {
          return { status: 403, body: { detail: action === 'archive' ? '본인이 만든 카테고리만 보관 처리할 수 있습니다.' : '본인이 만든 카테고리만 보관을 해제할 수 있습니다.' } };
        }
        category.status = action === 'archive' ? 'ARCHIVED' : 'ACTIVE';
        return { body: category };
      }
    }

    const transactionMatch = path.match(/^\/transactions\/(\d+)\/(cancel|restore)$/);
    if (method === 'PATCH' && transactionMatch) {
      const transaction = db.transactions.find((t) => t.id === Number(transactionMatch[1]));
      if (!transaction) return notFound('거래');
      if (transaction.user_id !== userId) return { status: 403, body: { detail: '본인이 등록한 거래만 변경할 수 있습니다.' } };
      const category = db.categories.find((c) => c.id === transaction.category_id);
      if (category?.status === 'ARCHIVED') {
        return { status: 409, body: { detail: '보관된 카테고리의 거래는 변경할 수 없습니다. 먼저 카테고리의 보관을 해제해 주세요.' } };
      }
      transaction.status = transactionMatch[2] === 'cancel' ? 'CANCELLED' : 'ACTIVE';
      return { body: transaction };
    }

    if (method === 'GET' && path === '/transactions') {
      const mine = db.transactions.filter((t) => t.user_id === userId).sort((a, b) => b.id - a.id);
      return { body: { items: mine, page: 1, size: 10, total_elements: mine.length, total_pages: mine.length ? 1 : 0, has_next: false } };
    }

    return notFound('요청한 주소');
  };

  return {
    db,
    calls,
    handler,
    /** 다음에 들어오는 해당 요청 한 번을 실패시킨다. */
    failNext(method: string, pattern: RegExp, result: Result) {
      failures.push({ method, pattern, result });
    },
    /** 해당 요청의 응답을 release()를 부를 때까지 붙잡아 둔다. (처리 중 상태를 보기 위해) */
    hold(method: string, pattern: RegExp) {
      let release!: () => void;
      holds.push({ method, pattern, promise: new Promise<void>((resolve) => (release = resolve)) });
      return { release: () => release() };
    },
    callsTo(method: string, pattern: RegExp) {
      return calls.filter((c) => c.method === method && pattern.test(c.path));
    },
  };
}
