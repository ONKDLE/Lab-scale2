import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmModal from './ConfirmModal';

function setup(props: Partial<Parameters<typeof ConfirmModal>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <>
      <button>바깥 버튼</button>
      <ConfirmModal open title="거래를 취소할까요?" message="합계에서 빠집니다." confirmLabel="거래 취소" onConfirm={onConfirm} onCancel={onCancel} {...props} />
    </>,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmModal', () => {
  it('제목과 설명이 있는 대화상자(dialog)로 열린다', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: '거래를 취소할까요?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('합계에서 빠집니다.');
  });

  it('open이 false면 아무것도 그리지 않는다', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('열리면 "닫기" 버튼에 포커스가 간다 (실수로 바로 확인하지 않게)', () => {
    setup();
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
  });

  it('확인 / 닫기 버튼이 각각 맞는 함수를 부른다', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await user.click(screen.getByRole('button', { name: '거래 취소' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Esc 키로 닫을 수 있다', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('바깥(어두운 영역)을 누르면 닫히지만, 팝업 안을 누르면 닫히지 않는다', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.click(screen.getByRole('dialog'));
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Tab 키가 팝업 밖으로 나가지 않고 안에서 돈다', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '거래 취소' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus(); // 맨 끝에서 처음으로
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '거래 취소' })).toHaveFocus(); // 맨 처음에서 끝으로
  });

  it('처리 중(busy)에는 버튼이 잠기고 "처리 중…"으로 바뀌며, Esc와 바깥 클릭으로 닫히지 않는다', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = setup({ busy: true });
    expect(screen.getByRole('button', { name: '처리 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('닫히면 원래 누르던 버튼으로 포커스가 돌아오고, 화면 스크롤 잠금도 풀린다', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const { rerender } = render(
      <ConfirmModal open title="t" message="m" confirmLabel="확인" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<ConfirmModal open={false} title="t" message="m" confirmLabel="확인" onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(outside).toHaveFocus();
    expect(document.body.style.overflow).not.toBe('hidden');
    outside.remove();
  });

  it('위험한 동작(danger)이면 확인 버튼이 빨간 스타일이다', () => {
    setup({ danger: true });
    expect(screen.getByRole('button', { name: '거래 취소' })).toHaveClass('danger-button--solid');
  });
});
