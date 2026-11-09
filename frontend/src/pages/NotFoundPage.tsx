import { Link } from 'react-router-dom';

interface Props {
  title?: string;
  message?: string;
  backTo?: string;
  backLabel?: string;
}

/** 없는 주소이거나, 삭제되었거나 볼 수 없는 항목일 때의 화면 */
export default function NotFoundPage({
  title = '페이지를 찾을 수 없습니다.',
  message = '주소가 잘못되었거나 이동된 페이지예요.',
  backTo = '/',
  backLabel = '처음으로',
}: Props) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      <p className="empty-hint">{message}</p>
      <Link to={backTo} className="secondary-button secondary-button--link">
        {backLabel}
      </Link>
    </div>
  );
}
