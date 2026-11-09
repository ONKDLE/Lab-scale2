interface Props {
  page: number;
  totalPages: number;
  hasNext: boolean; // 백엔드가 알려준 "다음 페이지가 있는지"
  onChange: (page: number) => void;
}

const WINDOW_SIZE = 5;

/** 현재 페이지 주변의 번호만 보여준다. 예) 전체 10페이지, 현재 5 -> [3, 4, 5, 6, 7] */
export function getPageWindow(page: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW_SIZE / 2), totalPages - WINDOW_SIZE + 1));
  const end = Math.min(totalPages, start + WINDOW_SIZE - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

/** 이전 / 페이지 번호 / 다음 버튼. 페이지가 하나뿐이면 보여주지 않는다. */
export default function Pagination({ page, totalPages, hasNext, onChange }: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="페이지 이동">
      <button
        type="button"
        className="page-button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="이전 페이지"
      >
        이전
      </button>

      {getPageWindow(page, totalPages).map((number) => (
        <button
          key={number}
          type="button"
          className={number === page ? 'page-button page-button--current' : 'page-button'}
          aria-current={number === page ? 'page' : undefined}
          onClick={() => onChange(number)}
        >
          {number}
        </button>
      ))}

      <button
        type="button"
        className="page-button"
        disabled={!hasNext}
        onClick={() => onChange(page + 1)}
        aria-label="다음 페이지"
      >
        다음
      </button>
    </nav>
  );
}
