"""
🚀 Auth Router
============
Autenticación multiusuario
"""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional
import jwt
from datetime import datetime, timedelta

router = APIRouter()

# Security
SECRET_KEY = "change-this-secret-key-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# Models
class User(BaseModel):
    id: str
    email: str
    username: str
    role: str = "user"


class Token(BaseModel):
    access_token: str
    token_type: str
    user: User


class UserCreate(BaseModel):
    email: str
    password: str
    username: str


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str


# Mock database
users_db = {
    "demo@cryptoai.com": {
        "id": "1",
        "email": "demo@cryptoai.com",
        "username": "demo",
        "password": "demo123",  # In production, hash this!
        "role": "admin"
    }
}


def create_access_token(data: dict) -> str:
    """Create JWT token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """Get current user from token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    
    user_data = users_db.get(email)
    if user_data is None:
        raise credentials_exception
    
    return User(
        id=user_data["id"],
        email=user_data["email"],
        username=user_data["username"],
        role=user_data["role"]
    )


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login endpoint"""
    user_data = users_db.get(form_data.username)
    
    if not user_data or user_data["password"] != form_data.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user_data["email"]})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=User(
            id=user_data["id"],
            email=user_data["email"],
            username=user_data["username"],
            role=user_data["role"]
        )
    )


@router.post("/register", response_model=UserResponse)
async def register(user_create: UserCreate):
    """Register new user"""
    if user_create.email in users_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    user_id = str(len(users_db) + 1)
    users_db[user_create.email] = {
        "id": user_id,
        "email": user_create.email,
        "username": user_create.username,
        "password": user_create.password,
        "role": "user"
    }
    
    return UserResponse(
        id=user_id,
        email=user_create.email,
        username=user_create.username,
        role="user"
    )


@router.get("/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user


@router.post("/logout")
async def logout():
    """Logout endpoint"""
    return {"message": "Successfully logged out"}