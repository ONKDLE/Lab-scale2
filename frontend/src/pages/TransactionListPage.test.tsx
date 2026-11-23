import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  apiHandler,
  deferred,
  makePage,
  makeTransaction,
  mockFetch,
  renderPage,
  transactionCalls,
  type MockResult,
} from '../test/helpers';

const location = () => screen.getByTestId('location');

/** 주소의 page 값을 읽어 "전체 3페이지, 25건"짜리 목록을 돌려주는 가짜 서버 */
function threePageServer(url: URL): MockResult {
  const page = Number(url.searchParams.get('page') ?? 1);
  const totalPages = 3;
  return {
    body: makePage({
      items: page > totalPages ? [] : [makeTransaction({ id: page, merchant_name: `거래 ${page}페이지` })],
      page,
      total_elements: 25,
      total_pages: totalPages,
      has_next: page < totalPages,
    }),
  };
}

describe('목록 렌더링 (비동기)', () => {
  it('불러오는 동안 스켈레톤을 보여주고, 응답이 오면 카드 목록으로 바뀐다', async () => {
    const slow = deferred<MockResult>();
    mockFetch(apiHandler(() => slow.promise));

    renderPage();

    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');

    slow.resolve({ body: makePage({ items: [makeTransaction({ merchant_name: '스타벅스 양산점' })] }) });

    expect(await screen.findByText('스타벅스 양산점')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton-list')).not.toBeInTheDocument();
  });

  it('금액, 날짜, 은행, 카테고리 이름, 취소 상태를 카드에 표시한다', async () => {
    mockFetch(
      apiHandler(() => ({
        body: makePage({
          items: [
            makeTransaction({ id: 1, merchant_name: '스타벅스 양산점', amount: '4500.00' }),
            makeTransaction({ id: 2, merchant_name: '시외버스 승차권', amount: '11800.00', status: 'CANCELLED', category_id: null }),
          ],
          total_elements: 2,
        }),
      })),
    );

    renderPage();

    expect(await screen.findByText('4,500원')).toBeInTheDocument();
    expect(screen.getByText('11,800원')).toBeInTheDocument();
    expect(screen.getAllByText('2026.09.01')).toHaveLength(2);
    expect(screen.getAllByText('국민은행')).toHaveLength(2);
    expect(await screen.findByText('카페')).toBeInTheDocument(); // /categories 응답으로 이름 표시
    expect(screen.getAllByText('취소됨')).toHaveLength(1);
    expect(screen.getByText('총 2건 · 1 / 1 페이지')).toBeInTheDocument();
  });

  it('카테고리 목록을 못 불러와도 거래 목록은 그대로 보여준다', async () => {
    mockFetch((url) =>
      url.pathname === '/categories' ? { status: 500, body: { detail: 'oops' } } : { body: makePage() },
    );

    renderPage();

    expect(await screen.findByText('스타벅스 양산점')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('빈 화면 / 에러 화면', () => {
  it('검색 결과가 없으면 "검색 결과가 없습니다." 를 보여주고, 필터 초기화로 되돌릴 수 있다', async () => {
    const user = userEvent.setup();
    mockFetch(
      apiHandler((url) => ({
        body: url.searchParams.has('keyword')
          ? makePage({ items: [], total_elements: 0, total_pages: 0 })
          : makePage(),
      })),
    );

    renderPage('/?keyword=없는가맹점');

    expect(await screen.findByText('검색 결과가 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('없는가맹점');

    await user.click(screen.getByRole('button', { name: '필터 초기화' }));

    expect(await screen.findByText('스타벅스 양산점')).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('필터 없이 데이터가 하나도 없으면 "등록된 거래가 없습니다." 를 보여준다', async () => {
    mockFetch(apiHandler(() => ({ body: makePage({ items: [], total_elements: 0, total_pages: 0 }) })));

    renderPage();

    expect(await screen.findByText('등록된 거래가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '필터 초기화' })).not.toBeInTheDocument();
  });

  it('서버가 에러를 주면 원인 메시지와 "다시 시도" 버튼을 보여주고, 누르면 다시 요청한다', async () => {
    const user = userEvent.setup();
    let transactionRequests = 0;
    const fetchMock = mockFetch(
      apiHandler(() => {
        transactionRequests += 1;
        return transactionRequests === 1
          ? { status: 500, body: { detail: '서버 내부 오류' } }
          : { body: makePage() };
      }),
    );

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('거래 내역을 불러오지 못했습니다.');
    expect(alert).toHaveTextContent('서버 내부 오류');

    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('스타벅스 양산점')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(transactionCalls(fetchMock)).toHaveLength(2);
  });

  it('서버에 연결이 안 되면 연결 실패 안내를 보여준다', async () => {
    mockFetch(apiHandler(() => 'network-error'));

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
    expect(screen.queryByTestId('skeleton-list')).not.toBeInTheDocument();
  });
});

describe('상태 필터 탭 / 검색', () => {
  it('상태 탭을 누르면 status를 붙여 다시 요청하고, 3페이지에 있었더라도 1페이지로 돌아간다', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(apiHandler(threePageServer));

    renderPage('/?page=3');
    expect(await screen.findByText('거래 3페이지')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '취소' }));

    await waitFor(() => expect(location()).toHaveTextContent(/^\/\?status=CANCELLED$/));
    const last = transactionCalls(fetchMock).at(-1)!;
    expect(last.searchParams.get('status')).toBe('CANCELLED');
    expect(last.searchParams.get('page')).toBe('1');
    expect(screen.getByRole('tab', { name: '취소' })).toHaveAttribute('aria-selected', 'true');
  });

  it('"전체" 탭을 누르면 status 없이 요청한다', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(apiHandler(threePageServer));

    renderPage('/?status=ACTIVE');
    await screen.findByText('거래 1페이지');

    await user.click(screen.getByRole('tab', { name: '전체' }));

    await waitFor(() => expect(location()).toHaveTextContent(/^\/$/));
    await waitFor(() => expect(transactionCalls(fetchMock).at(-1)!.searchParams.has('status')).toBe(false));
  });

  it('검색어를 Enter로 제출하면 keyword를 붙여 요청하고, 상태 필터는 유지하며 1페이지로 돌아간다', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(apiHandler(threePageServer));

    renderPage('/?page=3&status=ACTIVE');
    await screen.findByText('거래 3페이지');

    await user.type(screen.getByRole('searchbox'), '스타벅스{Enter}');

    await waitFor(() => {
      const params = new URLSearchParams(location().textContent!.split('?')[1]);
      expect(params.get('keyword')).toBe('스타벅스');
      expect(params.get('status')).toBe('ACTIVE');
      expect(params.has('page')).toBe(false);
    });
    const last = transactionCalls(fetchMock).at(-1)!;
    expect(last.searchParams.get('keyword')).toBe('스타벅스');
    expect(last.searchParams.get('status')).toBe('ACTIVE');
    expect(last.searchParams.get('page')).toBe('1');
  });

  it('검색 버튼을 눌러도 검색된다 (앞뒤 공백은 제거)', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(apiHandler(threePageServer));

    renderPage();
    await screen.findByText('거래 1페이지');

    await user.type(screen.getByRole('searchbox'), '  GS25  ');
    await user.click(screen.getByRole('button', { name: '검색' }));

    await waitFor(() => expect(transactionCalls(fetchMock).at(-1)!.searchParams.get('keyword')).toBe('GS25'));
  });

  it('조건을 연달아 바꿔도 늦게 도착한 옛날 응답이 화면을 덮어쓰지 않는다', async () => {
    const user = userEvent.setup();
    const oldResponse = deferred<MockResult>();
    mockFetch(
      apiHandler((url) =>
        url.searchParams.has('status')
          ? { body: makePage({ items: [makeTransaction({ merchant_name: '정상 거래' })] }) }
          : oldResponse.promise,
      ),
    );

    renderPage(); // 처음 요청(전체)은 응답이 안 온 상태
    await user.click(screen.getByRole('tab', { name: '정상' }));
    expect(await screen.findByText('정상 거래')).toBeInTheDocument();

    await act(async () => {
      oldResponse.resolve({ body: makePage({ items: [makeTransaction({ merchant_name: '옛날 응답' })] }) });
    });

    expect(screen.queryByText('옛날 응답')).not.toBeInTheDocument();
    expect(screen.getByText('정상 거래')).toBeInTheDocument();
  });
});

describe('페이지네이션 연동', () => {
  it('1페이지에서는 "이전"이 비활성, hasNext가 true면 "다음"이 활성이다', async () => {
    mockFetch(apiHandler(threePageServer));

    renderPage();
    await screen.findByText('거래 1페이지');

    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
  });

  it('마지막 페이지에서는 hasNext가 false라 "다음"이 비활성이다', async () => {
    mockFetch(apiHandler(threePageServer));

    renderPage('/?page=3');
    await screen.findByText('거래 3페이지');

    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeEnabled();
  });

  it('페이지 번호를 누르면 주소가 ?page=2로 바뀌고 2페이지 데이터를 다시 요청한다', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(apiHandler(threePageServer));

    renderPage();
    await screen.findByText('거래 1페이지');

    await user.click(screen.getByRole('button', { name: '2' }));

    expect(await screen.findByText('거래 2페이지')).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/\?page=2$/);
    expect(transactionCalls(fetchMock).at(-1)!.searchParams.get('page')).toBe('2');
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
  });

  it('페이지를 넘기는 동안에는 스켈레톤을 보여주고, 이전 페이지 목록은 숨긴다', async () => {
    const user = userEvent.setup();
    const slowSecondPage = deferred<MockResult>();
    mockFetch(
      apiHandler((url) => (url.searchParams.get('page') === '2' ? slowSecondPage.promise : threePageServer(url))),
    );

    renderPage();
    await screen.findByText('거래 1페이지');

    await user.click(screen.getByRole('button', { name: '2' }));

    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
    expect(screen.queryByText('거래 1페이지')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '페이지 이동' })).not.toBeInTheDocument();

    slowSecondPage.resolve(threePageServer(new URL('http://api.test/transactions?page=2')));

    expect(await screen.findByText('거래 2페이지')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton-list')).not.toBeInTheDocument();
  });

  it('"다음" / "이전" 버튼으로 한 페이지씩 이동하고, 검색 조건은 유지한다', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(apiHandler(threePageServer));

    renderPage('/?status=ACTIVE&keyword=스타벅스');
    await screen.findByText('거래 1페이지');

    await user.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(await screen.findByText('거래 2페이지')).toBeInTheDocument();
    const afterNext = transactionCalls(fetchMock).at(-1)!;
    expect(afterNext.searchParams.get('page')).toBe('2');
    expect(afterNext.searchParams.get('status')).toBe('ACTIVE');
    expect(afterNext.searchParams.get('keyword')).toBe('스타벅스');

    await user.click(screen.getByRole('button', { name: '이전 페이지' }));
    expect(await screen.findByText('거래 1페이지')).toBeInTheDocument();
  });

  it('주소창에 마지막 페이지보다 큰 번호(?page=99)를 넣으면 마지막 페이지로 맞춘다', async () => {
    const fetchMock = mockFetch(apiHandler(threePageServer));

    renderPage('/?page=99');

    expect(await screen.findByText('거래 3페이지')).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/\?page=3$/);
    expect(screen.queryByText('검색 결과가 없습니다.')).not.toBeInTheDocument();
    expect(transactionCalls(fetchMock).at(-1)!.searchParams.get('page')).toBe('3');
  });
});

describe('주소창 값 보정', () => {
  it('page=abc, status=DONE 같은 이상한 주소는 안전한 기본값(1페이지, 전체)으로 요청한다', async () => {
    const fetchMock = mockFetch(apiHandler(threePageServer));

    renderPage('/?page=abc&status=DONE&keyword=%20%20');
    await screen.findByText('거래 1페이지');

    const first = transactionCalls(fetchMock)[0];
    expect(first.searchParams.get('page')).toBe('1');
    expect(first.searchParams.has('status')).toBe(false);
    expect(first.searchParams.has('keyword')).toBe(false);
  });

  it('요청 주소는 환경 설정(VITE_API_BASE_URL)에서 가져온다', async () => {
    const fetchMock = mockFetch(apiHandler(threePageServer));

    renderPage();
    await screen.findByText('거래 1페이지');

    expect(transactionCalls(fetchMock)[0].origin).toBe('http://api.test');
  });
});
