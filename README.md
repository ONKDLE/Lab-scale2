# 마이핀(MyFin) 백엔드 — 4주차 스프린트1

기술명세서(웹앱개발팀용 양식)의 SQL DDL을 SQLAlchemy 모델로 옮기고,
스프린트1 목표인 **category(카테고리) CRUD API**를 구현했습니다.

## 폴더 구조
```
mypin/
├── app/
│   ├── main.py              # FastAPI 앱 진입점, 테이블 자동 생성 + 테스트용 유저 시드
│   ├── database.py          # DB 연결 설정 (기본: SQLite, PostgreSQL로 교체 가능)
│   ├── models.py            # 5개 테이블 ORM 모델 (user/category/transaction/budget/merchant_category_map)
│   ├── schemas.py           # 카테고리 API 요청/응답 검증(Pydantic)
│   └── routers/
│       └── category.py      # 카테고리 CRUD 5개 엔드포인트
├── smoke_test.py            # 동작 확인용 자동 테스트 (13개 케이스)
└── requirements.txt
```

## 실행 방법 (본인 PC에서)

1. 가상환경 생성 및 패키지 설치
   ```bash
   python -m venv venv
   source venv/bin/activate        # Windows는 venv\Scripts\activate
   pip install -r requirements.txt
   pip install httpx               # smoke_test.py 실행 시에만 필요
   ```

2. 서버 실행
   ```bash
   uvicorn app.main:app --reload
   ```
   실행되면 `http://127.0.0.1:8000/docs`에서 Swagger UI로 바로 시연 가능합니다.
   (`4주차_웹앱_스프린트1.hwp`에서 요구하는 "API 도구 또는 화면을 통한 시연"이 이 화면으로 충족됩니다.)

3. 동작 확인 (선택)
   ```bash
   python smoke_test.py
   ```
   카테고리 생성/조회/수정/삭제 + 엣지케이스(중복 이름, 하위 카테고리 있는데 삭제 시도) 13개 케이스를 자동으로 검증합니다.

## 구현된 엔드포인트

| Method | Path | 설명 | 성공 코드 |
|---|---|---|---|
| POST | /categories | 카테고리 생성 | 201 |
| GET | /categories | 카테고리 목록 조회 | 200 |
| GET | /categories/{id} | 카테고리 상세 조회 | 200 |
| PATCH | /categories/{id} | 카테고리 수정 | 200 |
| DELETE | /categories/{id} | 카테고리 삭제 | 204 |

## 반영된 엣지케이스 (PRD 5.1 기준)
- 동일 사용자 내 카테고리명 중복 생성 → 400
- 존재하지 않는 카테고리 조회/수정 → 404
- 자기 자신을 상위 카테고리로 지정 → 400
- 하위 카테고리가 있는 카테고리 삭제 시도 → 400 (먼저 하위부터 삭제해야 함)

## 아직 안 된 것 (다음 스프린트에서 진행)
- 인증(FR-06): 현재는 `DEFAULT_USER_ID = 1`로 고정된 테스트 유저만 사용합니다.
  로그인 기능이 생기면 `app/routers/category.py`의 `DEFAULT_USER_ID`를
  `Depends(get_current_user)`로 교체하면 됩니다.
- CSV 업로드(FR-01), 자동 분류(FR-03), 대시보드(FR-04), 예산 알림(FR-05)
