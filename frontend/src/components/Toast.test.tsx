import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

function Demo() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success('성공했어요')}>성공</button>
      <button onClick={() => toast.error('실패했어요')}>실패</button>
      <button onClick={() => toast.info('안내예요')}>안내</button>
    </>
  );
}

const setup = () => {
  render(
    <ToastProvider>
      <Demo />
    </ToastProvider>,
  );
};

describe('Toast', () => {
  afterEach(() => vi.useRealTimers());

  it('알림을 화면에 보여준다 (성공/안내는 status, 에러는 alert 역할)', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: '성공' }));
    await user.click(screen.getByRole('button', { name: '실패' }));
    expect(screen.getByRole('status')).toHaveTextContent('성공했어요');
    expect(screen.getByRole('alert')).toHaveTextContent('실패했어요');
  });

  it('성공 알림은 4초 뒤, 에러 알림은 6초 뒤에 저절로 사라진다', () => {
    vi.useFakeTimers();
    setup();
    act(() => screen.getByRole('button', { name: '성공' }).click());
    act(() => screen.getByRole('button', { name: '실패' }).click());

    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByText('성공했어요')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('성공했어요')).not.toBeInTheDocument();

    expect(screen.getByText('실패했어요')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText('실패했어요')).not.toBeInTheDocument();
  });

  it('닫기 버튼으로 바로 닫을 수 있다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: '안내' }));
    await user.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByText('안내예요')).not.toBeInTheDocument();
  });

  it('여러 개가 쌓여도 최대 4개까지만 보여준다', async () => {
    const user = userEvent.setup();
    setup();
    for (let i = 0; i < 6; i += 1) await user.click(screen.getByRole('button', { name: '성공' }));
    expect(screen.getAllByText('성공했어요')).toHaveLength(4);
  });

  it('ToastProvider 밖에서 쓰면 알기 쉬운 에러를 낸다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Demo />)).toThrow('ToastProvider');
    spy.mockRestore();
  });
});
