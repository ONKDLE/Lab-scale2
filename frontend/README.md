# 마이핀 프론트엔드 (React + Vite + TypeScript)

백엔드(FastAPI)의 거래 목록 API(`GET /transactions`)를 화면에 연결한 프로젝트입니다. (9주차 스프린트5)

## 화면 기능
- 거래 카드 목록 (가맹점명, 금액, 날짜, 은행, 카테고리, 취소 상태)
- 상태 탭: 전체 / 정상 / 취소
- 가맹점 검색 (Enter 또는 검색 버튼)
- 페이지 번호 + 이전/다음 버튼 (다음 버튼은 백엔드가 준 `has_next` 기준)
- 불러오는 중(스켈레톤) / 검색 결과 없음 / 에러(다시 시도 버튼) 화면
- 화면 상태가 주소창에 반영됨 → 새로고침, 뒤로가기, 주소 공유를 해도 같은 화면
  예) `http://localhost:5173/?page=2&status=ACTIVE&keyword=스타벅스`

## 실행 방법

준비물: **Node.js 18 이상** (20 LTS 권장). `node -v`로 확인하세요.

**1. 백엔드를 먼저 켭니다** (터미널 1, `mypin` 폴더에서)
```
..\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```
거래가 여러 건 있어야 페이지 나누기가 보이므로, 처음 한 번은 샘플 데이터를 넣어 주세요.
```
..\venv\Scripts\python.exe seed_demo_data.py
```

**2. 프론트엔드를 켭니다** (터미널 2, `mypin\frontend` 폴더에서)
```
npm install
npm run dev
```
브라우저에서 http://localhost:5173 을 엽니다.

> PowerShell에서 "스크립트를 실행할 수 없습니다" 오류가 나면, 같은 터미널에서 먼저 아래를 입력하세요.
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`

## 주소 설정
백엔드 주소는 코드에 적혀 있지 않고 `.env.development`의 `VITE_API_BASE_URL` 한 곳에서만 관리합니다.
백엔드를 다른 주소로 켰다면 이 값만 바꾸고 `npm run dev`를 다시 시작하세요.

## 테스트 / 빌드
```
npm test          # 화면 동작 자동 테스트 (실제 서버 없이 가짜 서버로 실행)
npm run build     # 타입 검사 + 배포용 빌드
```

## 폴더 구조
```
frontend/
├── .env.development          # 백엔드 주소 (VITE_API_BASE_URL)
├── src/
│   ├── api/                  # 서버 호출: client.ts(공통 클라이언트), transactions.ts, categories.ts
│   ├── types/                # 응답 타입 정의 (백엔드 schemas.py와 같은 모양)
│   ├── lib/                  # 주소창 쿼리스트링 처리, 금액/날짜 표시
│   ├── hooks/                # useTransactionList(목록 불러오기), useCategoryMap
│   ├── components/           # StatusTabs, SearchBar, TransactionList, Pagination, 스켈레톤/빈 화면/에러 화면
│   ├── pages/                # TransactionListPage (화면 전체 조립)
│   └── test/                 # 테스트 공용 도구
```

## 문제 해결
| 증상 | 원인과 해결 |
|---|---|
| 화면에 "서버에 연결할 수 없습니다" | 백엔드(FastAPI)가 꺼져 있거나 주소가 다릅니다. 터미널 1에서 서버가 켜져 있는지, `.env.development` 주소가 맞는지 확인하세요. |
| `Port 5173 is already in use` | 이미 켜진 프론트엔드가 있습니다. 그 터미널을 `Ctrl + C`로 끄세요. (백엔드가 5173 주소만 허용하므로 다른 포트로 자동 변경하지 않게 막아 두었습니다.) |
| 목록은 나오는데 카테고리 이름이 안 보임 | 카테고리 목록 호출이 실패한 경우입니다. 목록 자체는 정상이며 백엔드 상태를 확인하세요. |
