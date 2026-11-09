interface Props {
  filtered: boolean; // 검색어나 상태 필터가 걸려 있는지
  onReset: () => void;
}

/** 보여줄 거래가 없을 때의 화면 */
export default function EmptyState({ filtered, onReset }: Props) {
  return (
    <div className="empty-state">
      <p className="empty-title">{filtered ? '검색 결과가 없습니다.' : '등록된 거래가 없습니다.'}</p>
      {filtered && (
        <>
          <p className="empty-hint">검색어나 상태 필터를 바꿔 보세요.</p>
          <button type="button" className="secondary-button" onClick={onReset}>
            필터 초기화
          </button>
        </>
      )}
    </div>
  );
}
