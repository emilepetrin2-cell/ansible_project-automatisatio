# /home/elpetrino/projet/backend/main.py
import os
import json
from fastapi import FastAPI, HTTPException, Depends, status, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from auth import create_access_token, verify_password, get_password_hash
from dependencies import RoleChecker, get_current_user
from database import get_db, UserModel, Base, engine

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Ansible Automation API",
    description="Backend modulaire avec authentification SQLite & Cookies HttpOnly",
    version="1.2.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://192.168.48.131:5173",
    "http://192.168.48.131",
    "http://192.168.48.131:80",
    "http://192.168.48.131:3000",
    "http://127.0.0.1:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
PROJECT_DIR = "/home/elpetrino/projet"

allow_admin = RoleChecker(["admin"])
allow_operator_or_admin = RoleChecker(["admin", "operator"])
allow_all_authenticated = RoleChecker(["admin", "operator", "auditor"])

@app.on_event("startup")
def startup_db_seed():
    db = next(get_db())
    if db.query(UserModel).count() == 0:
        default_users = [
            UserModel(username="admin", hashed_password=get_password_hash("admin123"), role="admin"),
            UserModel(username="operator", hashed_password=get_password_hash("operator123"), role="operator"),
            UserModel(username="auditor", hashed_password=get_password_hash("auditor123"), role="auditor"),
        ]
        db.add_all(default_users)
        db.commit()
    db.close()

@app.get("/")
def read_root():
    return {"status": "online", "message": "API d'automatisation Ansible prete."}

# =========================================================================
# ENDPOINTS AUTHENTIFICATION
# =========================================================================

@app.post("/api/v1/auth/login")
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(UserModel).filter(UserModel.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nom d'utilisateur ou mot de passe incorrect."
        )
    
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role}
    )
    
    # Cookie HttpOnly configure pour autoriser le cross-origin local
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=28800
    )
    
    return {
        "message": "Connexion reussie",
        "role": user.role,
        "username": user.username
    }

@app.post("/api/v1/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Deconnexion reussie"}

@app.get("/api/v1/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# =========================================================================
# GESTION DES UTILISATEURS (ADMIN ONLY)
# =========================================================================

class UserCreate(BaseModel):
    username: str
    password: str
    role: str

class UserPasswordUpdate(BaseModel):
    new_password: str

@app.get("/api/v1/users", dependencies=[Depends(allow_admin)])
def list_users(db: Session = Depends(get_db)):
    users = db.query(UserModel).all()
    return [{"id": u.id, "username": u.username, "role": u.role} for u in users]

@app.post("/api/v1/users", dependencies=[Depends(allow_admin)])
def create_user(user_data: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(UserModel).filter(UserModel.username == user_data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="L'utilisateur existe deja.")
    
    if user_data.role not in ["admin", "operator", "auditor"]:
        raise HTTPException(status_code=400, detail="Role invalide (admin, operator, auditor).")
    
    new_user = UserModel(
        username=user_data.username.strip(),
        hashed_password=get_password_hash(user_data.password),
        role=user_data.role
    )
    db.add(new_user)
    db.commit()
    return {"message": f"Utilisateur {user_data.username} cree avec succes."}

@app.put("/api/v1/users/{username}/password", dependencies=[Depends(allow_admin)])
def update_user_password(username: str, pwd_data: UserPasswordUpdate, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    
    user.hashed_password = get_password_hash(pwd_data.new_password)
    db.commit()
    return {"message": f"Mot de passe modifie pour {username}."}

@app.delete("/api/v1/users/{username}", dependencies=[Depends(allow_admin)])
def delete_user(username: str, db: Session = Depends(get_db)):
    if username == "admin":
        raise HTTPException(status_code=400, detail="Impossible de supprimer le compte admin principal.")
    
    user = db.query(UserModel).filter(UserModel.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    
    db.delete(user)
    db.commit()
    return {"message": f"Utilisateur {username} supprime."}

# =========================================================================
# GESTION DES BACKUPS ET STATUTS
# =========================================================================

@app.get("/api/v1/status/{job_id}", dependencies=[Depends(allow_all_authenticated)])
async def get_job_status(job_id: str):
    status_file = f"/tmp/job_{job_id}.json"
    if not os.path.exists(status_file):
        return {"status": "running", "message": "Initialisation du playbook..."}
    try:
        with open(status_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"status": "running", "message": "Lecture du statut..."}

@app.get("/api/v1/backups/{hostname}", dependencies=[Depends(allow_all_authenticated)])
async def list_backups(hostname: str):
    clean_host = os.path.basename(hostname.strip())
    backup_dir = os.path.realpath(os.path.join(PROJECT_DIR, "backups", clean_host))
    base_backup_path = os.path.realpath(os.path.join(PROJECT_DIR, "backups"))
    
    if not backup_dir.startswith(base_backup_path) or not os.path.exists(backup_dir):
        return {"hostname": clean_host, "files": []}
    
    try:
        files = sorted(os.listdir(backup_dir), reverse=True)
        return {"hostname": clean_host, "files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/backups/{hostname}/{filename}", dependencies=[Depends(allow_all_authenticated)])
async def read_backup_file(hostname: str, filename: str):
    clean_host = os.path.basename(hostname.strip())
    clean_file = os.path.basename(filename.strip())
    base_backup_path = os.path.realpath(os.path.join(PROJECT_DIR, "backups"))
    target_path = os.path.realpath(os.path.join(PROJECT_DIR, "backups", clean_host, clean_file))
    
    if not target_path.startswith(base_backup_path) or not os.path.isfile(target_path):
        raise HTTPException(status_code=404, detail="Fichier introuvable.")
    
    try:
        with open(target_path, "r", encoding="utf-8") as f:
            return {"hostname": clean_host, "filename": clean_file, "content": f.read()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from cisco.cisco_router import router as cisco_router_api
from cisco.cisco_switch import router as cisco_switch_api

app.include_router(cisco_router_api, prefix="/api/v1/deploy", dependencies=[Depends(allow_operator_or_admin)])
app.include_router(cisco_switch_api, prefix="/api/v1/deploy", dependencies=[Depends(allow_operator_or_admin)])