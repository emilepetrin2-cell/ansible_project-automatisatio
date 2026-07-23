# /home/elpetrino/projet/backend/cisco/cisco_switch.py
import os
import json
import uuid
import tempfile
import subprocess
import ipaddress
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List

router = APIRouter()
PROJECT_DIR = "/home/elpetrino/projet"

class SwitchDeployRequest(BaseModel):
    vendor: str
    ssh: Dict[str, str]
    device_ip: str          
    vault_password: str     
    system: Dict[str, Any]
    interfaces: Dict[str, List[Any]]
    management: Dict[str, Any]
    save_configuration: bool

def validate_payload(payload: SwitchDeployRequest):
    system = payload.system
    interfaces = payload.interfaces
    mgmt = payload.management

    if payload.device_ip:
        try:
            ipaddress.ip_address(payload.device_ip.strip())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"L'adresse IP est invalide : '{payload.device_ip}'")

    ntp = str(system.get("ntpServer", "")).strip()
    if ntp:
        try:
            ipaddress.ip_address(ntp)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"L'IP du serveur NTP est invalide : '{ntp}'.")

    declared_vlan_ids = set()
    for v in system.get("vlans", []):
        try:
            v_id = int(v.get("id"))
            if not (1 <= v_id <= 4094):
                raise ValueError()
            declared_vlan_ids.add(v_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"L'ID de VLAN '{v.get('id')}' est invalide (1-4094).")

    for access in interfaces.get("access", []):
        try:
            acc_vlan = int(access.get("vlanId"))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"VLAN ID invalide pour l'interface '{access.get('name')}'.")

        if acc_vlan not in declared_vlan_ids:
            raise HTTPException(status_code=400, detail=f"Le port '{access.get('name')}' utilise le VLAN {acc_vlan} non declare !")

    mgmt_ip = str(mgmt.get("ip", "")).strip()
    mgmt_mask = str(mgmt.get("mask", "")).strip()
    mgmt_gw = str(mgmt.get("gateway", "")).strip()
    mgmt_vlan = mgmt.get("vlan")

    if mgmt_ip:
        try:
            ipaddress.ip_address(mgmt_ip)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"L'adresse IP SVI est invalide : '{mgmt_ip}'")

    if mgmt_mask:
        try:
            ipaddress.IPv4Network(f"0.0.0.0/{mgmt_mask}")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Le masque de sous-reseau SVI est invalide : '{mgmt_mask}'")

    if mgmt_gw:
        try:
            ipaddress.ip_address(mgmt_gw)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"La passerelle SVI est invalide : '{mgmt_gw}'")

    if mgmt_vlan:
        try:
            v_num = int(mgmt_vlan)
            if not (1 <= v_num <= 4094):
                raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"Le VLAN ID de gestion est invalide : '{mgmt_vlan}'")

def run_ansible_switch(job_id: str, inventory_content: str, ansible_vars: dict, vault_pass: str):
    log_file_path = f"/tmp/ansible_switch_{job_id}.log"
    status_file_path = f"/tmp/job_{job_id}.json"
    
    inv_file = tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False)
    vars_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    vault_tmp_path = f"/tmp/vault_{job_id}.tmp"
    
    vault_fd = os.open(vault_tmp_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)

    try:
        inv_file.write(inventory_content)
        inv_file.flush()
        inv_file.close()

        vars_file.write(json.dumps(ansible_vars))
        vars_file.flush()
        vars_file.close()
        
        with open(vault_fd, 'w', encoding='utf-8') as vault_f:
            vault_f.write(vault_pass)

        cmd = [
            "ansible-playbook", 
            "-i", inv_file.name, 
            f"{PROJECT_DIR}/site.yml", 
            "--extra-vars", f"@{vars_file.name}",
            "--vault-password-file", vault_tmp_path
        ]
        
        result = subprocess.run(
            cmd, 
            cwd=PROJECT_DIR, 
            env={**os.environ, "ANSIBLE_HOST_KEY_CHECKING": "False"},
            capture_output=True,
            text=True
        )

        print("\n=================== ANSIBLE SWITCH STDOUT ===================")
        print(result.stdout)
        if result.stderr:
            print("=================== ANSIBLE SWITCH STDERR ===================")
            print(result.stderr)
        print("=============================================================\n")

        with open(log_file_path, "w", encoding="utf-8") as log_f:
            log_f.write(f"=== STDOUT ===\n{result.stdout}\n=== STDERR ===\n{result.stderr}\n")

        if result.returncode != 0:
            error_output = (result.stderr + "\n" + result.stdout).strip()
            clean_error = "Echec du playbook Ansible Switch."

            if "Authentication failed" in error_output:
                clean_error = "Erreur SSH : Echec d'authentification."
            elif "Unreachable" in error_output or "Timeout" in error_output:
                clean_error = "Erreur Reseau : Switch cible injoignable sur l'IP."

            with open(status_file_path, "w", encoding="utf-8") as status_f:
                json.dump({"status": "failed", "error": clean_error, "raw": error_output}, status_f)
        else:
            with open(status_file_path, "w", encoding="utf-8") as status_f:
                json.dump({"status": "success", "message": "Playbook Switch execute avec succes."}, status_f)

    except Exception as e:
        err_msg = f"Crash critique du processus : {str(e)}"
        with open(status_file_path, "w", encoding="utf-8") as status_f:
            json.dump({"status": "failed", "error": err_msg}, status_f)
    finally:
        for path in [inv_file.name, vars_file.name, vault_tmp_path]:
            if os.path.exists(path):
                try:
                    os.unlink(path)
                except OSError:
                    pass

@router.post("/switch")
async def deploy_switch(payload: SwitchDeployRequest, background_tasks: BackgroundTasks):
    validate_payload(payload)

    ssh = payload.ssh
    system = payload.system
    interfaces = payload.interfaces
    mgmt = payload.management

    all_vlans = [{"id": int(v["id"]), "name": str(v["name"]).replace("\r", "").replace("\n", "").strip()} for v in system.get("vlans", [])]
    vlan_ids = [int(v["id"]) for v in system.get("vlans", [])]

    access_ports = []
    triggers = {"sec": False, "sn": False, "st": False, "bh": False}
    
    for i in interfaces.get("access", []):
        if i.get("portSecurity"): triggers["sec"] = True
        if i.get("dhcpSnooping"): triggers["sn"] = True
        if i.get("stormControl"): triggers["st"] = True
        if i.get("blackholing"): triggers["bh"] = True

        access_ports.append({
            "name": str(i["name"]).replace("\r", "").replace("\n", "").strip(),
            "id": int(i["vlanId"]),
            "nb_port": int(i.get("maxMac", 2)),
            "storm_control": {
                "enabled": i.get("stormControl", False),
                "broadcast": float(i.get("stormBroadcast", 10.0)),
                "multicast": float(i.get("stormMulticast", 10.0)),
                "unicast": float(i.get("stormUnicast", 10.0))
            }
        })

    trunk_ports = []
    for t in interfaces.get("trunk", []):
        st_enabled = t.get("stormControl", False)
        if st_enabled:
            triggers["st"] = True

        trunk_ports.append({
            "name": str(t["name"]).replace("\r", "").replace("\n", "").strip(),
            "dhcp_trust": t.get("dhcpTrust", True),
            "storm_control": {
                "enabled": st_enabled,
                "broadcast": float(t.get("stormBroadcast", 10.0)),
                "multicast": float(t.get("stormMulticast", 10.0)),
                "unicast": float(t.get("stormUnicast", 10.0))
            }
        })

    ansible_vars = {
        "all_vlans": all_vlans, 
        "vlan": vlan_ids, 
        "access_port": access_ports,
        "trunk_port": trunk_ports,
        "ntp_serveur": str(system.get("ntpServer", "")).replace("\r", "").replace("\n", "").strip(),
        "hostname": str(system.get("hostname", "")).replace("\r", "").replace("\n", "").strip(),
        "activate_port_security": triggers["sec"], 
        "activate_dhcp_snooping": triggers["sn"], 
        "activate_storm_control": triggers["st"], 
        "activate_blackholing": triggers["bh"],
        "activate_network_migration": True if mgmt.get("ip") else False,
        "management_ip": str(mgmt.get("ip", "")).strip(), 
        "management_mask": str(mgmt.get("mask", "")).strip(), 
        "management_vlan_id": mgmt.get("vlan"), 
        "management_gateway": str(mgmt.get("gateway", "")).strip(),
        "storm_control_default": {"broadcast": 10.0, "multicast": 10.0, "unicast": 10.0}
    }

    clean_hostname = str(system.get('hostname')).replace("\r", "").replace("\n", "").strip()
    job_id = str(uuid.uuid4())
    status_file_path = f"/tmp/job_{job_id}.json"
    
    with open(status_file_path, "w", encoding="utf-8") as status_f:
        json.dump({"status": "running", "message": "Execution du playbook Switch en cours..."}, status_f)

    inventory_data = (
        f"all:\n"
        f"  children:\n"
        f"    switches:\n"
        f"      hosts:\n"
        f"        {clean_hostname}:\n"
        f"          ansible_host: {payload.device_ip.strip()}\n"
        f"          ansible_user: {ssh.get('username').strip()}\n"
        f"          ansible_ssh_pass: {ssh.get('password').strip()}\n"
        f"          ansible_connection: network_cli\n"
        f"          ansible_network_os: cisco.ios.ios\n"
    )
    background_tasks.add_task(run_ansible_switch, job_id, inventory_data, ansible_vars, payload.vault_password)
    return {"status": "pending", "job_id": job_id, "message": f"Playbook Switch lance pour {clean_hostname}."}