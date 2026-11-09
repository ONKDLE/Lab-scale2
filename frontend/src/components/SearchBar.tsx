import { useEffect, useState, type FormEvent } from 'react';

interface Props {
  keyword: string; // 현재 적용된 검색어 (주소창 기준)
  onSearch: (keyword: string) => void;
}

/** 가맹점 검색창. Enter 또는 검색 버튼으로 제출한다. */
export default function SearchBar({ keyword, onSearch }: Props) {
  const [draft, setDraft] = useState(keyword);

  // 뒤로가기/앞으로가기, 필터 초기화처럼 주소창의 검색어가 바뀌면 입력칸도 맞춘다.
  useEffect(() => {
    setDraft(keyword);
  }, [keyword]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(draft.trim());
  };

  return (
    <form className="search-bar" role="search" onSubmit={handleSubmit}>
      <label className="visually-hidden" htmlFor="keyword-input">
        가맹점 검색
      </label>
      <input
        id="keyword-input"
        type="search"
        placeholder="가맹점명으로 검색 (예: 스타벅스)"
        value={draft}
        maxLength={100}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" className="search-button">
        검색
      </button>
    </form>
  );
}
