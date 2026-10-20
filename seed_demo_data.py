"""
시연용 샘플 데이터 넣기 (7주차: 페이지 나누기/필터/검색을 눈으로 확인하려면 거래가 여러 건 필요함).

- 기본 사용자(id=1)에게 카테고리 3개와 거래 30건을 넣는다.
- 이미 들어있는 데이터는 건너뛰므로 여러 번 실행해도 중복되지 않는다.
- 서버를 켜둔 채로 실행해도 되고, 끄고 실행해도 된다. (mypin 폴더 안에서 실행해야 mypin.db를 찾는다)

실행: ..\\venv\\Scripts\\python.exe seed_demo_data.py
"""
import os
import sys
from datetime import date
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))

from app import models, schemas
from app.database import Base, SessionLocal, engine
from app.main import _seed_test_users
from app.routers.transaction import _make_row_hash

USER_ID = 1

# (카테고리, 가맹점명, 금액, 날짜, 상태)
SAMPLES = [
    ("카페", "스타벅스 양산점", 4500, date(2026, 9, 1), "ACTIVE"),
    ("카페", "스타벅스 강남점", 5200, date(2026, 9, 3), "ACTIVE"),
    ("카페", "스타벅스 부산대점", 6100, date(2026, 9, 5), "CANCELLED"),
    ("카페", "이디야커피 양산점", 3800, date(2026, 9, 6), "ACTIVE"),
    ("카페", "메가커피 양산점", 2500, date(2026, 9, 8), "ACTIVE"),
    ("카페", "투썸플레이스 부산대점", 7200, date(2026, 9, 10), "ACTIVE"),
    ("카페", "스타벅스 양산점", 4800, date(2026, 9, 12), "ACTIVE"),
    ("카페", "스타벅스 서면점", 5500, date(2026, 9, 15), "CANCELLED"),
    ("카페", "컴포즈커피 양산점", 2000, date(2026, 9, 18), "ACTIVE"),
    ("카페", "스타벅스 양산점", 4500, date(2026, 9, 20), "ACTIVE"),
    ("식비", "GS25 양산점", 3200, date(2026, 9, 2), "ACTIVE"),
    ("식비", "CU 편의점", 2800, date(2026, 9, 4), "ACTIVE"),
    ("식비", "김밥천국", 6500, date(2026, 9, 7), "ACTIVE"),
    ("식비", "맘스터치 양산점", 8900, date(2026, 9, 9), "ACTIVE"),
    ("식비", "롯데리아 양산점", 7800, date(2026, 9, 11), "ACTIVE"),
    ("식비", "본죽 양산점", 9500, date(2026, 9, 13), "ACTIVE"),
    ("식비", "배달의민족", 15500, date(2026, 9, 14), "ACTIVE"),
    ("식비", "파리바게뜨 양산점", 4300, date(2026, 9, 16), "ACTIVE"),
    ("식비", "GS25 양산점", 1800, date(2026, 9, 19), "ACTIVE"),
    ("식비", "쿠팡이츠", 17200, date(2026, 9, 22), "CANCELLED"),
    ("교통", "티머니 충전", 20000, date(2026, 9, 1), "ACTIVE"),
    ("교통", "카카오택시", 8700, date(2026, 9, 6), "ACTIVE"),
    ("교통", "지하철 요금", 1550, date(2026, 9, 9), "ACTIVE"),
    ("교통", "카카오택시", 12300, date(2026, 9, 17), "ACTIVE"),
    ("교통", "티머니 충전", 10000, date(2026, 9, 21), "ACTIVE"),
    ("교통", "KTX 승차권", 43500, date(2026, 9, 25), "ACTIVE"),
    ("교통", "시외버스 승차권", 11800, date(2026, 9, 26), "CANCELLED"),
    ("교통", "주유소 GS칼텍스", 52000, date(2026, 9, 27), "ACTIVE"),
    ("교통", "하이패스 충전", 30000, date(2026, 9, 28), "ACTIVE"),
    ("교통", "지하철 요금", 1550, date(2026, 9, 29), "ACTIVE"),
]


def main():
    Base.metadata.create_all(bind=engine)
    _seed_test_users()

    db = SessionLocal()
    try:
        categories = {}
        for name in ("카페", "식비", "교통"):
            category = db.query(models.Category).filter(
                models.Category.user_id == USER_ID, models.Category.name == name
            ).first()
            if category is None:
                category = models.Category(user_id=USER_ID, name=name)
                db.add(category)
                db.commit()
                db.refresh(category)
            categories[name] = category

        added = 0
        for category_name, merchant, amount, tx_date, tx_status in SAMPLES:
            payload = schemas.TransactionCreate(
                category_id=categories[category_name].id,
                merchant_name=merchant,
                amount=Decimal(amount),
                transaction_date=tx_date,
                source_bank="국민은행",
            )
            row_hash = _make_row_hash(USER_ID, payload)
            if db.query(models.Transaction).filter(models.Transaction.raw_row_hash == row_hash).first():
                continue  # 이미 있는 거래는 건너뜀
            db.add(models.Transaction(
                user_id=USER_ID,
                category_id=categories[category_name].id,
                merchant_name=merchant,
                amount=Decimal(amount),
                transaction_date=tx_date,
                source_bank="국민은행",
                raw_row_hash=row_hash,
                status=tx_status,
            ))
            added += 1
        db.commit()

        total = db.query(models.Transaction).filter(models.Transaction.user_id == USER_ID).count()
        print(f"새로 넣은 거래: {added}건 / 현재 사용자 1의 전체 거래: {total}건")
    finally:
        db.close()


if __name__ == "__main__":
    main()
