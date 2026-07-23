# /home/elpetrino/projet/backend/main.py
import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Ansible Automation API",
    description="Backend modulaire pour la gestion des playbooks reseau",
    version="1.0.0"
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_DIR = "/home/elpetrino/projet"

@app.get("/")
def read_root():
    return {"status": "online", "message": "API d'automatisation Ansible prete."}

# =========================================================================
# GESTION SECURISEE DES STATUTS DE JOBS ET BACKUPS
# =========================================================================

@app.get("/api/v1/status/{job_id}")
async def get_job_status(job_id: str):
    """ Recuperation du statut d'une tache d'apres son UUID """
    status_file = f"/tmp/job_{job_id}.json"
    
    if not os.path.exists(status_file):
        return {"status": "running", "message": "Initialisation du playbook..."}
    
    try:
        with open(status_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"status": "running", "message": "Lecture du statut..."}

@app.get("/api/v1/backups/{hostname}")
async def list_backups(hostname: str):
    """ Lister tous les fichiers de sauvegarde pour un equipement donne """
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

@app.get("/api/v1/backups/{hostname}/{filename}")
async def read_backup_file(hostname: str, filename: str):
    """ Lecture securisee du contenu brut d'un fichier de sauvegarde """
    clean_host = os.path.basename(hostname.strip())
    clean_file = os.path.basename(filename.strip())
    
    base_backup_path = os.path.realpath(os.path.join(PROJECT_DIR, "backups"))
    target_path = os.path.realpath(os.path.join(PROJECT_DIR, "backups", clean_host, clean_file))
    
    if not target_path.startswith(base_backup_path) or not os.path.isfile(target_path):
        raise HTTPException(status_code=404, detail="Fichier introuvable ou acces refuse.")
    
    try:
        with open(target_path, "r", encoding="utf-8") as f:
            return {"hostname": clean_host, "filename": clean_file, "content": f.read()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from cisco.cisco_router import router as cisco_router_api
from cisco.cisco_switch import router as cisco_switch_api

app.include_router(cisco_router_api, prefix="/api/v1/deploy")
app.include_router(cisco_switch_api, prefix="/api/v1/deploy")