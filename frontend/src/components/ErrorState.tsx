interface Props {
  message: string;
  onRetry: () => void;
}

/** 목록을 불러오지 못했을 때의 화면 */
export default function ErrorState({ message, onRetry }: Props) {
  return (
    <div className="error-state" role="alert">
      <p className="error-title">거래 내역을 불러오지 못했습니다.</p>
      <p className="error-message">{message}</p>
      <button type="button" className="secondary-button" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}
