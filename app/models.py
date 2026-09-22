"""
기술명세서 '3. 데이터 모델링'에서 정의한 5개 테이블의 ORM 모델.
SQL DDL(기술명세서 3-3)과 컬럼/제약조건이 1:1로 대응되도록 작성했습니다.
"""
from sqlalchemy import (
    Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Float, func
)
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    categories = relationship("Category", back_populates="owner")


class Category(Base):
    __tablename__ = "category"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    name = Column(String(50), nullable=False)
    icon = Column(String(20), nullable=True)
    color = Column(String(7), nullable=True)  # HEX, 예: #4472C4
    parent_category_id = Column(Integer, ForeignKey("category.id"), nullable=True)

    owner = relationship("User", back_populates="categories")
    parent = relationship("Category", remote_side=[id], backref="subcategories")


class Transaction(Base):
    __tablename__ = "transaction"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"), nullable=True)
    merchant_name = Column(String(100), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    transaction_date = Column(Date, nullable=False)
    source_bank = Column(String(30), nullable=False)
    raw_row_hash = Column(String(64), unique=True, nullable=False)


class Budget(Base):
    __tablename__ = "budget"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"), nullable=False)
    month = Column(String(7), nullable=False)  # YYYY-MM
    limit_amount = Column(Numeric(12, 2), nullable=False)


class MerchantCategoryMap(Base):
    __tablename__ = "merchant_category_map"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    merchant_keyword = Column(String(100), nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"), nullable=False)
    confidence_score = Column(Float, nullable=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now())
