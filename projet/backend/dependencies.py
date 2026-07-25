# /home/elpetrino/projet/backend/dependencies.py
from fastapi import Request, HTTPException, status, Depends
from jose import JWTError, jwt
from auth import SECRET_KEY, ALGORITHM

def get_current_user(request: Request):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalide ou session expiree.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Rrcuperation du token depuis le cookie HttpOnly
    token = request.cookies.get("access_token")
    
    # Fallback sur l'en-tete Authorization si pas de cookie
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise credentials_exception

    try:
        if token.startswith("Bearer "):
            token = token.split(" ")[1]
            
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if username is None or role is None:
            raise credentials_exception
        return {"username": username, "role": role}
    except JWTError:
        raise credentials_exception


class RoleChecker:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Droits insuffisants pour effectuer cette action."
            )
        return current_user