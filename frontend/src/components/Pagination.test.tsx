import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Pagination, { getPageWindow } from './Pagination';

describe('getPageWindow', () => {
  it.each([
    [1, 10, [1, 2, 3, 4, 5]],
    [5, 10, [3, 4, 5, 6, 7]],
    [10, 10, [6, 7, 8, 9, 10]],
    [1, 3, [1, 2, 3]],
    [2, 1, [1]],
  ])('현재 %i페이지 / 전체 %i페이지 -> %j', (page, totalPages, expected) => {
    expect(getPageWindow(page, totalPages)).toEqual(expected);
  });
});

describe('Pagination', () => {
  it('페이지가 하나뿐이면 아무것도 보여주지 않는다', () => {
    const { container } = render(<Pagination page={1} totalPages={1} hasNext={false} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('현재 페이지에 aria-current를 표시한다', () => {
    render(<Pagination page={2} totalPages={3} hasNext onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute('aria-current');
  });

  it('번호를 누르면 그 페이지 번호로 onChange를 호출한다', async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={3} hasNext onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('다음 버튼 활성 여부는 페이지 수가 아니라 백엔드가 준 hasNext를 따른다', () => {
    render(<Pagination page={1} totalPages={3} hasNext={false} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
  });
});
