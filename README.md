# 마이핀(MyFin) 백엔드

기술명세서(웹앱개발팀용 양식)의 SQL DDL을 SQLAlchemy 모델로 옮기고,
스프린트별로 기능을 하나씩 완성해가는 프로젝트입니다.

- **4주차 스프린트1**: category(카테고리) CRUD API
- **5주차 스프린트2**: transaction(거래) 테이블 추가 + category와 FK 연결 + 조건 처리 API(중복 거래 거절)
- **6주차 스프린트3**: 관계형 조회(JOIN) + 상태 변경·취소 API + 권한(인가) 체크
- **7주차 스프린트4**: 거래 목록 페이지 나누기 + 정렬 + 상태 필터 + 키워드 검색 + 잘못된 값 400 처리
- **9주차 스프린트5**: React 화면 연동 (거래 목록, 상태 탭, 검색, 페이지 번호, 로딩/빈/에러 화면) + 백엔드 CORS 허용
- **카드 이용내역 업로드**: 카드사 이용내역 엑셀(.xls)을 올리면 거래로 저장 (중복 방지, 이상한 줄은 건너뛰고 이유 안내)

## 폴더 구조
```
mypin/
├── app/
│   ├── main.py              # FastAPI 앱 진입점, 테이블 자동 생성 + 테스트용 유저 2명 시드
│   ├── database.py          # DB 연결 설정 (기본: SQLite, PostgreSQL로 교체 가능)
│   ├── models.py             # 5개 테이블 ORM 모델 (status 컬럼 포함)
│   ├── schemas.py            # API 요청/응답 검증(Pydantic)
│   ├── deps.py               # 임시 '요청자 식별' 장치 (로그인 생기기 전까지 X-User-Id 헤더로 대체)
│   ├── importers/
│   │   └── card_statement.py # 카드 이용내역 엑셀(.xls) 읽기
│   └── routers/
│       ├── category.py       # 카테고리 CRUD + 상세조회(거래 묶음) + 보관(archive)
│       ├── importer.py       # 이용내역 파일 업로드 (POST /transactions/import)
│       └── transaction.py    # 거래 등록/조회 + 취소(cancel)
├── smoke_test.py             # 스프린트1 자동 테스트 (13개)
├── smoke_test_sprint2.py     # 스프린트2 자동 테스트 (9개)
├── smoke_test_sprint3.py     # 스프린트3 자동 테스트 (11개)
├── smoke_test_sprint4.py     # 스프린트4 자동 테스트 (27개)
├── smoke_test_sprint5.py     # 스프린트5 백엔드 테스트 (CORS, 7개)
├── smoke_test_import.py      # 이용내역 업로드 테스트
├── seed_demo_data.py         # 시연용 샘플 거래 30건 넣기
├── frontend/                 # React 화면 (실행 방법은 frontend/README.md)
├── requirements.txt          # 실행에 필요한 패키지
└── requirements-dev.txt      # 테스트에만 필요한 패키지
```

## 실행 방법

1. 가상환경 생성 및 패키지 설치
   ```bash
   python -m venv venv
   source venv/bin/activate        # Windows는 venv\Scripts\activate
   pip install -r requirements.txt
   pip install -r requirements-dev.txt   # 테스트(smoke_test)를 돌릴 때만 필요
   ```

2. 서버 실행
   ```bash
   uvicorn app.main:app --reload
   ```
   `http://127.0.0.1:8000/docs` 에서 Swagger UI로 시연 가능합니다.

3. 동작 확인 (선택)
   ```bash
   python smoke_test.py            # 스프린트1
   python smoke_test_sprint2.py    # 스프린트2
   python smoke_test_sprint3.py    # 스프린트3
   python smoke_test_sprint4.py    # 스프린트4
   python smoke_test_sprint5.py    # 스프린트5 (CORS)
   python smoke_test_import.py     # 이용내역 업로드
   ```

4. 시연용 샘플 데이터 넣기 (선택, 페이지 나누기를 눈으로 보려면 필요)
   ```bash
   python seed_demo_data.py        # 거래 30건 (여러 번 실행해도 중복되지 않음)
   ```

## 화면(프론트엔드) 실행 — 9주차

백엔드를 켠 상태에서, 다른 터미널로 `frontend` 폴더에 들어가 실행합니다. 자세한 내용은 `frontend/README.md`를 보세요.
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm test         # 화면 자동 테스트
```
백엔드는 `http://localhost:5173`, `http://127.0.0.1:5173`에서 온 요청만 허용합니다(CORS). 배포할 때는 환경변수 `CORS_ORIGINS`로 바꿉니다.

## 구현된 엔드포인트

### category
| Method | Path | 설명 | 성공 코드 |
|---|---|---|---|
| POST | /categories | 카테고리 생성 | 201 |
| GET | /categories | 카테고리 목록 조회 | 200 |
| GET | /categories/{id} | 카테고리 상세 + **연결된 거래 목록 함께 조회** | 200 |
| PATCH | /categories/{id} | 카테고리 수정 | 200 |
| PATCH | /categories/{id}/archive | 카테고리 보관 처리 (본인 소유만, 아니면 403) | 200 |
| DELETE | /categories/{id} | 카테고리 삭제 | 204 |

### transaction
| Method | Path | 설명 | 성공 코드 |
|---|---|---|---|
| POST | /transactions | 거래 등록 (중복이면 400) | 201 |
| GET | /transactions | 거래 목록 조회 (페이지 나누기·정렬·필터·검색) | 200 / 400 |
| GET | /transactions/{id} | 거래 상세 조회 | 200 |
| POST | /transactions/import | 카드 이용내역 엑셀(.xls) 업로드 | 200 / 400 / 413 |
| PATCH | /transactions/{id}/cancel | 거래 취소 처리 (본인 소유만, 아니면 403) | 200 |

### 거래 목록 조회 파라미터 (스프린트4)

| 파라미터 | 설명 | 기본값 | 잘못된 값 |
|---|---|---|---|
| page | 페이지 번호 (1부터) | 1 | 0, 음수, 숫자 아님 → 400 |
| size | 페이지당 개수 | 10 | 0, 음수, 100 초과, 숫자 아님 → 400 |
| sort | `필드,방향` (필드: id, transaction_date, amount, merchant_name / 방향: asc, desc) | transaction_date,desc | 없는 필드·방향 → 400 |
| status | ACTIVE 또는 CANCELLED | (전체) | 그 외 값 → 400 |
| keyword | 가맹점명 검색어 (부분 일치) | (검색 안 함) | 100자 초과 → 400 |

응답에는 거래 목록(`items`)과 함께 `page`, `size`, `total_elements`, `total_pages`, `has_next`가 들어갑니다.
예: `GET /transactions?status=ACTIVE&keyword=스타벅스&sort=amount,asc&page=1&size=5`
(status와 keyword를 같이 보내면 두 조건을 모두 만족하는 거래만 나옵니다.)

## 카드 이용내역 업로드

카드사 사이트에서 받은 **이용내역 엑셀(.xls)** 을 올리면 거래로 저장합니다.
Swagger(`/docs`)의 `POST /transactions/import` → `Try it out` → 파일 선택 → `Execute`.

- 머리글 이름(`이용일시`, `이용하신곳`, `이용금액`, `상태`)으로 열을 찾기 때문에, 머리글 위에 제목 줄이 있어도 되고 열 위치가 달라도 됩니다.
- 같은 파일을 다시 올려도 이미 저장된 거래는 건너뜁니다 (거래 시각까지 비교해서 같은 날 같은 금액을 두 번 결제한 경우는 별개로 저장).
- 줄 하나가 이상해도 전체가 실패하지 않고, 응답의 `errors`에 건너뛴 줄 번호와 이유가 담깁니다.
- 응답 예: `{"imported": 4, "duplicates": 0, "skipped": 0, "total_rows": 4, ...}`
- 카테고리는 비워 둡니다(미분류). `source_bank`는 출처 이름(기본 `체크카드`)입니다.

**아직 안 되는 것 (한계)**
- `.xls`만 지원합니다. `.xlsx`, `.csv`는 샘플이 없어서 아직 지원하지 않습니다.
- 샘플에는 정상 결제(`전표매입`)만 있어서, 상태에 '취소'가 들어 있으면 취소 거래로 보는 것까지만 구현했습니다. 금액이 0 이하인 줄은 건너뛰고 이유를 알려 줍니다.
- 같은 분(分)에 같은 가게에서 같은 금액을 결제한 줄이 한 파일에 두 개 있으면 1건으로 저장됩니다.
- 새로 설치한 패키지(`python-multipart`, `xlrd`)가 필요합니다: `python -m pip install -r requirements.txt`

## 권한(인가) 체크 시연 방법 — X-User-Id 헤더

아직 로그인 기능이 없어서, Swagger UI의 `Try it out`에서 **`x-user-id`** 입력란에
값을 넣으면 "그 번호의 사용자가 요청한 것"으로 흉내낼 수 있습니다.

- 비워두면 → 기본 사용자(id=1)로 처리됨
- `2`를 입력하면 → "다른 사용자(id=2)"가 요청한 것으로 처리됨

예시: user1이 만든 카테고리를 `x-user-id: 2`로 archive 시도 → **403 Forbidden** 발생 확인 가능

## 반영된 엣지케이스 / 조건 처리 / 권한 체크

**category**
- 동일 사용자 내 카테고리명 중복 생성 → 400
- 존재하지 않는 카테고리 조회/수정 → 404
- 자기 자신을 상위 카테고리로 지정 → 400
- 하위 카테고리가 있는 카테고리 삭제 시도 → 400
- 상세 조회 시 연결된 거래를 쿼리 1번으로 함께 가져옴 (N+1 방지)
- **남의 카테고리를 보관(archive) 시도 → 403**

**transaction**
- 존재하지 않는 페이지(데이터 없는 페이지) 조회 → 200 OK + 빈 목록
- 검색어의 `%`, `_`는 와일드카드가 아니라 글자로 검색
- 전체 개수는 COUNT 쿼리, 목록은 LIMIT/OFFSET 쿼리로 분리해서 조회
- 같은 날짜·금액·가맹점·은행의 거래를 중복 등록 시도 → 400
- 존재하지 않는 category_id로 거래 생성 시도 → 404
- **남의 거래를 취소(cancel) 시도 → 403**
- 존재하지 않는 거래를 취소 시도 → 404

## 아직 안 된 것 (다음 스프린트에서 진행)
- 인증(FR-06): 현재는 `X-User-Id` 헤더로 사용자를 흉내 냅니다.
  로그인 기능이 생기면 `app/deps.py`의 `get_current_user_id`만 '토큰에서 사용자 추출'로 바꾸면
  모든 라우터가 자동으로 실제 로그인 사용자를 쓰게 됩니다 (라우터 코드는 수정 불필요).
- CSV 업로드(FR-01), 자동 분류(FR-03), 대시보드(FR-04), 예산 알림(FR-05)
