import os
import subprocess
import json
import tempfile
from datetime import datetime
from celery import Celery
# Remplacement de get_db par SessionLocal pour ouvrir une vraie session worker
from database import SessionLocal, ExecutionLogModel

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "orchestrator_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=3600,  
)

@celery_app.task(bind=True)
def run_ansible_task(self, playbook_path: str, extra_vars: dict = None, log_id: int = None):
    if extra_vars is None:
        extra_vars = {}
        
    self.update_state(state="PROGRESS", meta={"status": "running", "message": "Execution du playbook Ansible..."})
    
    # Ouverture propre d'une session BDD autonome pour Celery
    db = SessionLocal()
    log_entry = None
    
    try:
        if log_id:
            log_entry = db.query(ExecutionLogModel).filter(ExecutionLogModel.id == log_id).first()
            if log_entry:
                log_entry.status = "RUNNING"
                log_entry.task_id = str(self.request.id)
                db.commit()

        cmd = [
            "ansible-playbook",
            "-vvv",
            playbook_path
        ]
        
        # 1. Extraction de l'inventaire
        inventory_path = extra_vars.pop("inventory_path", None)
        if inventory_path:
            cmd.extend(["-i", inventory_path])

        # 2. Gestion du mot de passe Ansible Vault
        vault_pass = extra_vars.pop("vault_password", None)
        vault_file_path = None
        if vault_pass:
            vault_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
            vault_file.write(str(vault_pass).strip())
            vault_file.flush()
            vault_file.close()
            vault_file_path = vault_file.name
            cmd.extend(["--vault-password-file", vault_file_path])

        if extra_vars:
            cmd.extend(["--extra-vars", json.dumps(extra_vars)])
            
        print(f"\n[DEBUG CMD] Running command: {' '.join(cmd)}\n", flush=True)
        env = os.environ.copy()
        env["ANSIBLE_HOST_KEY_CHECKING"] = "False"

        # Execution du subprocess
        process = subprocess.run(cmd, capture_output=True, text=True, check=True, env=env)
        print(f"\n--- [ANSIBLE SUCCESS OUTPUT] ---\n{process.stdout}\n--------------------------------\n", flush=True)
        
        # Enregistrement du resultat positif en BDD
        if log_entry:
            log_entry.status = "SUCCESS"
            log_entry.stdout = process.stdout
            log_entry.completed_at = datetime.now()
            db.commit()

        return {
            "status": "completed",
            "message": "Playbook execute avec succes.",
            "output": process.stdout
        }

    except subprocess.CalledProcessError as e:
        error_output = e.stdout if e.stdout else e.stderr
        print(f"\n--- [ANSIBLE FAILED OUTPUT] ---\n{error_output}\n-------------------------------\n", flush=True)
        
        # Enregistrement de l'echec en BDD
        if log_entry:
            log_entry.status = "FAILED"
            log_entry.stdout = e.stdout
            log_entry.stderr = error_output
            log_entry.completed_at = datetime.utcnow()
            db.commit()

        return {
            "status": "failed",
            "message": "Erreur lors de l'execution du playbook.",
            "stderr": error_output
        }    
        
    finally:
        # Nettoyage du fichier temporaire Vault
        if 'vault_file_path' in locals() and vault_file_path and os.path.exists(vault_file_path):
            os.remove(vault_file_path)
        # Fermeture imperative de la session BDD du worker
        db.close()