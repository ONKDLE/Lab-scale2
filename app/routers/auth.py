"""
회원가입 / 로그인 API.

POST /auth/register  이메일 + 비밀번호로 가입 (비밀번호는 bcrypt로 암호화해서 저장)
POST /auth/login     로그인 -> 토큰 발급 (Swagger의 Authorize 버튼과 호환되는 폼 형식)
GET  /auth/me        지금 로그인한 사용자 정보
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user_id, unauthorized
from app.security import (
    burn_password_check,
    create_access_token,
    email_problem,
    hash_password,
    normalize_email,
    password_problem,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

INVALID_LOGIN_MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다."


@router.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.RegisterRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    problem = email_problem(email) or password_problem(payload.password)
    if problem:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=problem)

    if db.query(models.User).filter(models.User.email == email).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")

    user = models.User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # 같은 이메일로 동시에 가입한 경우
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")
    db.refresh(user)
    return user


@router.post("/login", response_model=schemas.TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == normalize_email(form.username)).first()
    if user is None:
        burn_password_check(form.password)  # 없는 이메일이어도 같은 시간이 걸리게
        raise unauthorized(INVALID_LOGIN_MESSAGE)
    if not verify_password(form.password, user.password_hash):
        raise unauthorized(INVALID_LOGIN_MESSAGE)  # 이메일이 틀렸는지 비밀번호가 틀렸는지 알려주지 않는다
    return schemas.TokenOut(access_token=create_access_token(user.id))


@router.get("/me", response_model=schemas.UserOut)
def me(current_user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    return db.get(models.User, current_user_id)
