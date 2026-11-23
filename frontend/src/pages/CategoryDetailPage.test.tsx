import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi, makeCategory, tokenFor } from '../test/fakeApi';
import { makeTransaction, mockFetch } from '../test/helpers';
import { renderApp } from '../test/renderApp';
import { getToken } from '../auth/tokenStorage';

const location = () => screen.getByTestId('location');
// 요약 칸의 제목(dt)만 찾는다. ("취소"는 거래 줄의 버튼 글자와 같아서 그냥 찾으면 여러 개가 걸린다)
const summaryValue = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling;

async function open(path = '/categories/1', as = 1) {
  const api = createFakeApi();
  mockFetch(api.handler);
  renderApp(path, { token: tokenFor(as) });
  const user = userEvent.setup();
  return { api, user };
}

/** 확인 팝업에서 확인 버튼을 누른다 */
async function confirmDialog(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name }));
}

describe('카테고리 상세: 보여주기', () => {
  it('카테고리 정보, 상태 뱃지, 요약(정상 거래 건수·합계·취소 건수)을 보여준다', async () => {
    await open();
    expect(await screen.findByRole('heading', { name: '카페' })).toBeInTheDocument();
    expect(screen.getByText('사용 중')).toBeInTheDocument();
    expect(summaryValue('정상 거래')).toHaveTextContent('2건');
    expect(summaryValue('합계')).toHaveTextContent('14,400원');
    expect(summaryValue('취소')).toHaveTextContent('1건');
  });

  it('그 카테고리의 거래를 최신순으로 보여주고, 취소된 거래에는 "취소됨"을 붙인다', async () => {
    await open();
    await screen.findByRole('heading', { name: '카페' });
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('스타벅스 양산점'),
      expect.stringContaining('오엑스피시방'),
      expect.stringContaining('하이비스PC'),
    ]);
    expect(within(rows[2]).getByText('취소됨')).toBeInTheDocument();
    expect(within(rows[0]).getByText('2026.10.30')).toBeInTheDocument();
    expect(screen.queryByText('넷플릭스')).not.toBeInTheDocument(); // 다른 카테고리의 거래는 안 나온다
  });

  it('불러오는 동안 뼈대 화면을 보여준다', async () => {
    const api = createFakeApi();
    mockFetch(api.handler);
    const hold = api.hold('GET', /categories\/1$/);
    renderApp('/categories/1', { token: tokenFor(1) });
    expect(await screen.findByTestId('skeleton-list')).toBeInTheDocument();
    hold.release();
    expect(await screen.findByRole('heading', { name: '카페' })).toBeInTheDocument();
  });

  it('거래가 없는 카테고리는 안내 문구를 보여준다', async () => {
    await open('/categories/3');
    expect(await screen.findByText('이 카테고리에는 아직 거래가 없습니다.')).toBeInTheDocument();
    expect(summaryValue('합계')).toHaveTextContent('0원');
  });

  it('"← 카테고리 목록" 링크로 목록에 돌아간다', async () => {
    const { user } = await open();
    await user.click(await screen.findByRole('link', { name: '← 카테고리 목록' }));
    expect(location()).toHaveTextContent(/^\/categories$/);
    expect(await screen.findByRole('link', { name: /교통/ })).toBeInTheDocument();
  });

  it('거래 내역 화면의 카테고리 이름을 누르면 그 카테고리 상세로 간다', async () => {
    const { user } = await open('/');
    const chips = await screen.findAllByRole('link', { name: '카페' });
    await user.click(chips[0]);
    expect(await screen.findByRole('heading', { name: '카페' })).toBeInTheDocument();
    expect(location()).toHaveTextContent('/categories/1');
  });
});

describe('거래 취소 ↔ 취소 복구 (확인 팝업 + 즉시 갱신)', () => {
  it('"취소"를 누르면 확인 팝업이 뜨고, 확인하면 상태·뱃지·버튼 글자·요약이 바로 바뀐다', async () => {
    const { api, user } = await open();
    await user.click(await screen.findByRole('button', { name: '스타벅스 양산점 거래 취소' }));

    const dialog = await screen.findByRole('dialog', { name: '거래를 취소할까요?' });
    expect(dialog).toHaveTextContent('스타벅스 양산점');
    expect(dialog).toHaveTextContent('4,400원');
    expect(api.callsTo('PATCH', /cancel/)).toHaveLength(0); // 아직 서버에 보내지 않았다

    await user.click(within(dialog).getByRole('button', { name: '거래 취소' }));

    expect(await screen.findByText('거래를 취소했습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.callsTo('PATCH', /transactions\/1\/cancel/)).toHaveLength(1);

    const row = screen.getAllByRole('listitem')[0];
    expect(within(row).getByText('취소됨')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '스타벅스 양산점 취소 복구' })).toBeInTheDocument(); // 버튼이 "복구"로 바뀜
    expect(summaryValue('정상 거래')).toHaveTextContent('1건');
    expect(summaryValue('합계')).toHaveTextContent('10,000원');
    expect(summaryValue('취소')).toHaveTextContent('2건');
  });

  it('팝업에서 "닫기"를 누르면 서버에 보내지 않고 아무것도 바뀌지 않는다', async () => {
    const { api, user } = await open();
    await user.click(await screen.findByRole('button', { name: '스타벅스 양산점 거래 취소' }));
    await confirmDialog(user, '닫기');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.callsTo('PATCH', /cancel/)).toHaveLength(0);
    expect(summaryValue('정상 거래')).toHaveTextContent('2건');
    expect(screen.queryByText('거래를 취소했습니다.')).not.toBeInTheDocument();
  });

  it('취소된 거래의 "취소 복구"를 누르면 팝업을 거쳐 다시 정상으로 돌아가고 합계에 포함된다', async () => {
    const { api, user } = await open();
    await user.click(await screen.findByRole('button', { name: '하이비스PC 취소 복구' }));
    expect(await screen.findByRole('dialog', { name: '취소한 거래를 복구할까요?' })).toBeInTheDocument();
    await confirmDialog(user, '복구');

    expect(await screen.findByText('거래를 복구했습니다.')).toBeInTheDocument();
    expect(api.callsTo('PATCH', /transactions\/3\/restore/)).toHaveLength(1);
    expect(screen.queryByText('취소됨')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '하이비스PC 거래 취소' })).toBeInTheDocument();
    expect(summaryValue('정상 거래')).toHaveTextContent('3건');
    expect(summaryValue('합계')).toHaveTextContent('24,400원');
    expect(summaryValue('취소')).toHaveTextContent('0건');
  });

  it('처리 중에는 팝업 버튼과 다른 버튼이 잠겨서, 여러 번 눌러도 요청은 한 번만 간다', async () => {
    const { api, user } = await open();
    const hold = api.hold('PATCH', /cancel/);
    await user.click(await screen.findByRole('button', { name: '스타벅스 양산점 거래 취소' }));
    await confirmDialog(user, '거래 취소');

    const busy = await screen.findByRole('button', { name: '처리 중…' });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(screen.getByRole('button', { name: '오엑스피시방 거래 취소' })).toBeDisabled();
    hold.release();

    expect(await screen.findByText('거래를 취소했습니다.')).toBeInTheDocument();
    expect(api.callsTo('PATCH', /cancel/)).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('카테고리 보관 ↔ 보관 해제 (본인 전용 마감 토글)', () => {
  it('"보관하기" → 확인 → 뱃지가 "보관됨"으로 바뀌고, 안내 문구가 뜨고, 거래 버튼이 잠긴다', async () => {
    const { api, user } = await open();
    await user.click(await screen.findByRole('button', { name: '보관하기' }));
    expect(await screen.findByRole('dialog', { name: '카테고리를 보관할까요?' })).toBeInTheDocument();
    await confirmDialog(user, '보관');

    expect(await screen.findByText('카테고리를 보관했습니다.')).toBeInTheDocument();
    expect(api.callsTo('PATCH', /categories\/1\/archive/)).toHaveLength(1);
    expect(screen.getByText('보관됨')).toBeInTheDocument();
    expect(screen.queryByText('사용 중')).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('보관된 카테고리예요');
    expect(screen.getByRole('button', { name: '보관 해제' })).toBeInTheDocument(); // 버튼이 "보관 해제"로 바뀜
    expect(screen.getByRole('button', { name: '스타벅스 양산점 거래 취소' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '하이비스PC 취소 복구' })).toBeDisabled();
  });

  it('보관된 카테고리를 열면 처음부터 잠겨 있고(안내 문구, 비활성 버튼), "보관 해제"로 풀 수 있다', async () => {
    const { api, user } = await open('/categories/2');
    expect(await screen.findByRole('heading', { name: '구독' })).toBeInTheDocument();
    expect(screen.getByText('보관됨')).toBeInTheDocument();
    expect(screen.getByRole('note')).toBeInTheDocument();

    const transactionButton = screen.getByRole('button', { name: '넷플릭스 거래 취소' });
    expect(transactionButton).toBeDisabled();
    expect(transactionButton).toHaveAttribute('title', '보관된 카테고리의 거래는 변경할 수 없습니다.');
    await user.click(transactionButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // 잠긴 버튼은 팝업을 열지 못한다

    await user.click(screen.getByRole('button', { name: '보관 해제' }));
    expect(await screen.findByRole('dialog', { name: '보관을 해제할까요?' })).toBeInTheDocument();
    await confirmDialog(user, '보관 해제');

    expect(await screen.findByText('보관을 해제했습니다.')).toBeInTheDocument();
    expect(api.callsTo('PATCH', /categories\/2\/unarchive/)).toHaveLength(1);
    expect(screen.getByText('사용 중')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '넷플릭스 거래 취소' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '보관하기' })).toBeInTheDocument();
  });

  it('보관했다가 해제하면 거래를 다시 취소할 수 있다 (서버 규칙과 화면이 함께 풀린다)', async () => {
    const { api, user } = await open();
    await user.click(await screen.findByRole('button', { name: '보관하기' }));
    await confirmDialog(user, '보관');
    await screen.findByText('카테고리를 보관했습니다.');
    await user.click(screen.getByRole('button', { name: '보관 해제' }));
    await confirmDialog(user, '보관 해제');
    await screen.findByText('보관을 해제했습니다.');

    await user.click(screen.getByRole('button', { name: '스타벅스 양산점 거래 취소' }));
    await confirmDialog(user, '거래 취소');
    expect(await screen.findByText('거래를 취소했습니다.')).toBeInTheDocument();
    expect(api.callsTo('PATCH', /transactions\/1\/cancel/)).toHaveLength(1);
  });
});

describe('실패했을 때 사용자 안내', () => {
  it('권한이 없다는 응답(403)이면 서버의 안내 문구를 알림으로 보여주고, 화면 상태는 그대로 둔다', async () => {
    const { api, user } = await open();
    api.failNext('PATCH', /cancel/, { status: 403, body: { detail: '본인이 등록한 거래만 취소할 수 있습니다.' } });
    await user.click(await screen.findByRole('button', { name: '스타벅스 양산점 거래 취소' }));
    await confirmDialog(user, '거래 취소');

    expect(await screen.findByRole('alert')).toHaveTextContent('본인이 등록한 거래만 취소할 수 있습니다.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(summaryValue('정상 거래')).toHaveTextContent('2건');
    expect(screen.queryByText('거래를 취소했습니다.')).not.toBeInTheDocument();
  });

  it('보관된 카테고리라서 거절되면(409) 보관 해제를 안내하는 서버 문구를 보여준다', async () => {
    const { api, user } = await open();
    api.failNext('PATCH', /cancel/, {
      status: 409,
      body: { detail: '보관된 카테고리의 거래는 변경할 수 없습니다. 먼저 카테고리의 보관을 해제해 주세요.' },
    });
    await user.click(await screen.findByRole('button', { name: '스타벅스 양산점 거래 취소' }));
    await confirmDialog(user, '거래 취소');
    expect(await screen.findByRole('alert')).toHaveTextContent('먼저 카테고리의 보관을 해제해 주세요.');
  });

  it('서버에 연결되지 않으면 연결 실패를 알림으로 보여준다', async () => {
    const { api, user } = await open();
    api.failNext('PATCH', /archive/, 'network-error');
    await user.click(await screen.findByRole('button', { name: '보관하기' }));
    await confirmDialog(user, '보관');
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
    expect(screen.getByText('사용 중')).toBeInTheDocument();
  });

  it('동작 중 로그인이 만료되면(401) 에러 알림 대신 "만료" 안내를 한 번만 보여주고 로그인 화면으로 보낸다', async () => {
    const { api, user } = await open();
    api.failNext('PATCH', /cancel/, { status: 401, body: { detail: '로그인이 만료되었거나 올바르지 않습니다.' } });
    await user.click(await screen.findByRole('button', { name: '스타벅스 양산점 거래 취소' }));
    await confirmDialog(user, '거래 취소');

    expect(await screen.findByText('로그인이 만료되었습니다. 다시 로그인해 주세요.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // 에러 알림이 겹쳐 뜨지 않는다
    expect(getToken()).toBeNull();
  });

  it('상세를 불러오지 못하면 원인과 "다시 시도" 버튼을 보여주고, 누르면 다시 불러온다', async () => {
    const { api, user } = await open('/categories/1');
    await screen.findByRole('heading', { name: '카페' });
    // 목록으로 갔다가 다시 들어오면서 한 번 실패시킨다
    api.failNext('GET', /categories\/3$/, { status: 500, body: { detail: '서버 내부 오류' } });
    await user.click(screen.getByRole('link', { name: '← 카테고리 목록' }));
    await user.click(await screen.findByRole('link', { name: /교통/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('서버 내부 오류');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('heading', { name: '교통' })).toBeInTheDocument();
  });
});

describe('찾을 수 없음 / 권한별 접근', () => {
  it('없는 카테고리는 "찾을 수 없습니다" 화면과 목록으로 가는 링크를 보여준다', async () => {
    const { user } = await open('/categories/999');
    expect(await screen.findByText('카테고리를 찾을 수 없습니다.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '카테고리 목록으로' }));
    expect(location()).toHaveTextContent(/^\/categories$/);
  });

  it('주소가 숫자가 아니면(/categories/abc) 서버에 묻지 않고 바로 "찾을 수 없습니다"를 보여준다', async () => {
    const { api } = await open('/categories/abc');
    expect(await screen.findByText('카테고리를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(api.callsTo('GET', /^\/categories\/.+/)).toHaveLength(0); // 어떤 상세 주소로도 서버에 묻지 않는다
  });

  it('다른 계정의 카테고리 주소를 열면 "찾을 수 없습니다"가 나온다 (내용이 새어 나가지 않음)', async () => {
    await open('/categories/9', 1); // 9번은 사용자 2의 카테고리
    expect(await screen.findByText('카테고리를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('타인의 거래')).not.toBeInTheDocument();
  });

  it('다른 계정(사용자 2)으로 로그인해서 사용자 1의 카테고리 주소를 열어도 마찬가지다', async () => {
    await open('/categories/1', 2);
    expect(await screen.findByText('카테고리를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('스타벅스 양산점')).not.toBeInTheDocument();
  });

  it('다른 계정으로 로그인하면 자기 카테고리에서는 모든 기능을 쓸 수 있다', async () => {
    const { api, user } = await open('/categories/9', 2);
    expect(await screen.findByRole('heading', { name: '타인의 카테고리' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '타인의 거래 거래 취소' }));
    await confirmDialog(user, '거래 취소');
    expect(await screen.findByText('거래를 취소했습니다.')).toBeInTheDocument();
    expect(api.callsTo('PATCH', /transactions\/5\/cancel/)[0].headers.get('Authorization')).toBe('Bearer token-2');
  });

  it('내 카테고리가 아닌 데이터가 내려오더라도(방어) 보관 버튼과 거래 버튼을 보여주지 않는다', async () => {
    const api = createFakeApi();
    mockFetch(api.handler);
    api.failNext('GET', /categories\/1$/, {
      body: {
        ...makeCategory({ id: 1, user_id: 2, name: '남의 카페' }),
        transaction_count: 1,
        total_amount: '1000.00',
        transactions: [makeTransaction({ id: 50, user_id: 2, category_id: 1, merchant_name: '남의 가게' })],
      },
    });
    renderApp('/categories/1', { token: tokenFor(1) });

    expect(await screen.findByRole('heading', { name: '남의 카페' })).toBeInTheDocument();
    expect(screen.getByText('남의 가게')).toBeInTheDocument(); // 읽기만 가능
    expect(screen.queryByRole('button', { name: '보관하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /거래 취소/ })).not.toBeInTheDocument();
  });
});
