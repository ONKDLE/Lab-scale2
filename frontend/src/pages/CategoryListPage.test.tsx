import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi, tokenFor } from '../test/fakeApi';
import { mockFetch } from '../test/helpers';
import { renderApp } from '../test/renderApp';

const location = () => screen.getByTestId('location');

function setup(as = 1) {
  const api = createFakeApi();
  mockFetch(api.handler);
  renderApp('/categories', { token: tokenFor(as) });
  return { api, user: userEvent.setup() };
}

describe('카테고리 목록', () => {
  it('불러오는 동안 뼈대 화면을 보여주고, 끝나면 카드 목록으로 바뀐다', async () => {
    const api = createFakeApi();
    mockFetch(api.handler);
    const hold = api.hold('GET', /^\/categories$/);
    renderApp('/categories', { token: tokenFor(1) });

    expect(await screen.findByTestId('category-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');

    hold.release();
    expect(await screen.findByRole('heading', { name: '카테고리' })).toBeInTheDocument();
    expect(screen.queryByTestId('category-skeleton')).not.toBeInTheDocument();
  });

  it('카드마다 이름, 거래 건수, 합계(정상 거래만)를 보여준다', async () => {
    setup();
    const cafe = await screen.findByRole('link', { name: /카페/ });
    expect(cafe).toHaveTextContent('거래 2건 · 14,400원'); // 취소된 1건은 제외
    expect(screen.getByRole('link', { name: /교통/ })).toHaveTextContent('거래 0건 · 0원');
    expect(screen.getByRole('link', { name: /구독/ })).toHaveTextContent('거래 1건 · 17,000원');
    expect(screen.getByText('총 3개 (보관 1개)')).toBeInTheDocument();
  });

  it('보관된 카테고리는 "보관됨" 표시와 함께 사용 중인 카테고리 뒤쪽에 나온다', async () => {
    setup();
    await screen.findByRole('link', { name: /카페/ });
    const order = screen.getAllByRole('link', { name: /거래 \d+건/ }).map((link) => link.textContent);
    expect(order[0]).toContain('카페');
    expect(order[1]).toContain('교통');
    expect(order[2]).toContain('구독');
    expect(within(screen.getByRole('link', { name: /구독/ })).getByText('보관됨')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /카페/ })).queryByText('보관됨')).not.toBeInTheDocument();
  });

  it('카드는 상세 화면 주소(/categories/번호)로 연결된다', async () => {
    setup();
    expect(await screen.findByRole('link', { name: /카페/ })).toHaveAttribute('href', '/categories/1');
    expect(screen.getByRole('link', { name: /교통/ })).toHaveAttribute('href', '/categories/3');
  });

  it('카드를 누르면 상세 화면으로 이동한다', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('link', { name: /카페/ }));
    expect(await screen.findByRole('heading', { name: '카페' })).toBeInTheDocument();
    expect(location()).toHaveTextContent('/categories/1');
  });

  it('위쪽 메뉴에서 현재 위치(카테고리)가 표시된다', async () => {
    setup();
    await screen.findByRole('link', { name: /카페/ });
    expect(within(screen.getByRole('navigation', { name: '주요 메뉴' })).getByRole('link', { name: '카테고리' })).toHaveAttribute('aria-current', 'page');
  });

  it('카테고리가 하나도 없으면 안내 문구를 보여준다', async () => {
    const api = createFakeApi();
    api.db.categories = [];
    mockFetch(api.handler);
    renderApp('/categories', { token: tokenFor(1) });
    expect(await screen.findByText('아직 카테고리가 없습니다.')).toBeInTheDocument();
  });

  it('불러오기에 실패하면 원인과 "다시 시도" 버튼을 보여주고, 누르면 다시 불러온다', async () => {
    const api = createFakeApi();
    mockFetch(api.handler);
    api.failNext('GET', /^\/categories$/, { status: 500, body: { detail: '서버 내부 오류' } });
    renderApp('/categories', { token: tokenFor(1) });
    const user = userEvent.setup();

    expect(await screen.findByRole('alert')).toHaveTextContent('서버 내부 오류');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('link', { name: /카페/ })).toBeInTheDocument();
  });

  it('다른 계정으로 로그인하면 그 계정의 카테고리만 보인다', async () => {
    setup(2);
    expect(await screen.findByRole('link', { name: /타인의 카테고리/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /카페/ })).not.toBeInTheDocument();
  });
});
