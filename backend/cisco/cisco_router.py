# /home/elpetrino/projet/backend/cisco/cisco_router.py
import os
import json
import uuid
import tempfile
import subprocess
import ipaddress
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

router = APIRouter()
PROJECT_DIR = "/home/elpetrino/projet"

class TargetDevice(BaseModel):
    hostname: str
    vendor: str
    username: str
    password: str
    device_ip: str
    vault_password: str

class RouterDeployRequest(BaseModel):
    target: TargetDevice
    variables: Dict[str, Any]

def validate_router_payload(payload: RouterDeployRequest):
    tgt = payload.target
    vars_data = payload.variables

    if tgt.device_ip:
        try:
            ipaddress.ip_address(tgt.device_ip.strip())
        except ValueError:
            raise HTTPException(
                status_code=400, 
                detail=f"L'adresse IP du routeur est invalide : '{tgt.device_ip}'"
            )

    if vars_data.get("trigger_hardening", False):
        mgmt_sub = str(vars_data.get("management_subnet", "")).strip()
        mgmt_wild = str(vars_data.get("management_wildcard", "")).strip()

        if mgmt_sub:
            try:
                ipaddress.ip_address(mgmt_sub)
            except ValueError:
                raise HTTPException(
                    status_code=400, 
                    detail=f"L'adresse du sous-reseau de gestion (Mgmt Subnet) est invalide : '{mgmt_sub}'"
                )

        if mgmt_wild:
            try:
                ipaddress.ip_address(mgmt_wild)
            except ValueError:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Le masque Wildcard de gestion (Mgmt Wildcard) est invalide : '{mgmt_wild}'"
                )

    if vars_data.get("trigger_base_services", False):
        ntp = str(vars_data.get("ntp_server", "")).strip()
        if ntp:
            try:
                ipaddress.ip_address(ntp)
            except ValueError:
                raise HTTPException(
                    status_code=400, 
                    detail=f"L'IP du serveur NTP est invalide : '{ntp}'"
                )

        syslog = str(vars_data.get("syslog_server", "")).strip()
        if syslog:
            try:
                ipaddress.ip_address(syslog)
            except ValueError:
                raise HTTPException(
                    status_code=400, 
                    detail=f"L'IP du serveur Syslog est invalide : '{syslog}'"
                )

    # 4. Validation Module 4 : Interfaces L3
    if vars_data.get("trigger_interfaces", False):
        interfaces = vars_data.get("network_interfaces", [])
        if not interfaces:
            raise HTTPException(
                status_code=400, 
                detail="Le module Interfaces est active mais aucune interface n'a ete definie."
            )

        for intf in interfaces:
            name = str(intf.get("name", "")).strip()
            if len(name) < 3:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Le nom d'interface '{name}' est invalide ou trop court (ex: GigabitEthernet1)."
                )

            ip = str(intf.get("ip_address", "")).strip()
            mask = str(intf.get("netmask", "")).strip()

            if ip.lower() != "dhcp":
                try:
                    ipaddress.ip_address(ip)
                except ValueError:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"L'adresse IP '{ip}' pour l'interface '{name}' est invalide."
                    )

                if mask:
                    try:
                        # Validation propre IP + Masque decimal (ex: 192.168.30.1/255.255.255.0)
                        ipaddress.IPv4Interface(f"{ip}/{mask}")
                    except ValueError:
                        raise HTTPException(
                            status_code=400, 
                            detail=f"Le masque de sous-reseau '{mask}' pour l'interface '{name}' est invalide."
                        )

    if vars_data.get("trigger_routing", False) and vars_data.get("enable_ospf", False):
        router_id = str(vars_data.get("ospf_router_id", "")).strip()
        if router_id:
            try:
                ipaddress.ip_address(router_id)
            except ValueError:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Le Router ID OSPF est invalide : '{router_id}'"
                )

    if vars_data.get("trigger_nat", False):
        subnets = vars_data.get("subnet_choose", [])
        for item in subnets:
            nat_ip = str(item.get("ip", "")).strip()
            nat_wild = str(item.get("wildcard_mask", "")).strip()

            if nat_ip:
                try:
                    ipaddress.ip_address(nat_ip)
                except ValueError:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"L'IP de sous-reseau NAT est invalide : '{nat_ip}'"
                    )

            if nat_wild:
                try:
                    ipaddress.ip_address(nat_wild)
                except ValueError:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Le masque Wildcard NAT est invalide : '{nat_wild}'"
                    )

    if vars_data.get("trigger_dhcp", False):
        pools = vars_data.get("dhcp_pools", [])
        for pool in pools:
            net = str(pool.get("subnet_network", "")).strip()
            mask = str(pool.get("subnet_mask", "")).strip()
            gw = str(pool.get("default_router", "")).strip()

            if net:
                try:
                    ipaddress.ip_address(net)
                except ValueError:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"L'adresse de sous-reseau DHCP du pool '{pool.get('name')}' est invalide : '{net}'"
                    )
            if mask and net:
                try:
                    # strict=False permet d'accepter une IP reseau avec masque decimal (ex: 192.168.20.0/255.255.255.0)
                    ipaddress.IPv4Network(f"{net}/{mask}", strict=False)
                except ValueError:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Le masque du pool DHCP '{pool.get('name')}' est invalide : '{mask}'"
                    )
            if gw:
                try:
                    ipaddress.ip_address(gw)
                except ValueError:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"La passerelle du pool DHCP '{pool.get('name')}' est invalide : '{gw}'"
                    )

def run_ansible_router(job_id: str, inventory_content: str, ansible_vars: dict, vault_pass: str):
    log_file_path = f"/tmp/ansible_router_{job_id}.log"
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

        print("\n=================== ANSIBLE ROUTER STDOUT ===================")
        print(result.stdout)
        if result.stderr:
            print("=================== ANSIBLE ROUTER STDERR ===================")
            print(result.stderr)
        print("=============================================================\n")

        with open(log_file_path, "w", encoding="utf-8") as log_f:
            log_f.write(f"=== STDOUT ===\n{result.stdout}\n=== STDERR ===\n{result.stderr}\n")

        if result.returncode != 0:
            error_output = (result.stderr + "\n" + result.stdout).strip()
            clean_error = "Echec du playbook Ansible Routeur."

            if "Invalid input detected" in error_output or "Cannot find interface" in error_output:
                clean_error = "Erreur Cisco IOS : Syntaxe rejetee ou interface inexistante."
            elif "Authentication failed" in error_output or "Permission denied" in error_output:
                clean_error = "Erreur SSH : Echec d'authentification."
            elif "Unreachable" in error_output or "Failed to connect" in error_output:
                clean_error = "Erreur Reseau : Hote cible injoignable sur l'IP specifiee."

            with open(status_file_path, "w", encoding="utf-8") as status_f:
                json.dump({"status": "failed", "error": clean_error, "raw": error_output}, status_f)
        else:
            with open(status_file_path, "w", encoding="utf-8") as status_f:
                json.dump({"status": "success", "message": "Playbook Routeur execute avec succes."}, status_f)

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

@router.post("/router")
async def deploy_router(payload: RouterDeployRequest, background_tasks: BackgroundTasks):
    validate_router_payload(payload)

    tgt = payload.target
    job_id = str(uuid.uuid4())
    status_file_path = f"/tmp/job_{job_id}.json"
    
    with open(status_file_path, "w", encoding="utf-8") as status_f:
        json.dump({"status": "running", "message": "Execution du playbook Routeur en cours..."}, status_f)

    inventory_data = (
        f"all:\n"
        f"  children:\n"
        f"    routers:\n"
        f"      hosts:\n"
        f"        {tgt.hostname.strip()}:\n"
        f"          ansible_host: {tgt.device_ip.strip()}\n"
        f"          ansible_user: {tgt.username.strip()}\n"
        f"          ansible_ssh_pass: {tgt.password.strip()}\n"
        f"          ansible_network_os: cisco.ios.ios\n"
        f"          ansible_connection: network_cli\n"
    )
    
    ansible_vars = payload.variables
    ansible_vars["hostname"] = tgt.hostname.strip()

    # -------------------------------------------------------------
    # FIX ANSIBLE ACLs : Injecte "afi: ipv4" requis par cisco.ios.ios_acls
    # -------------------------------------------------------------
    raw_acls = ansible_vars.get("cisco_acls_config", [])
    if raw_acls and isinstance(raw_acls, list) and len(raw_acls) > 0:
        # Si la liste n'est pas deja enveloppee avec afi
        if "afi" not in raw_acls[0]:
            ansible_vars["cisco_acls_config"] = [
                {
                    "afi": "ipv4",
                    "acls": raw_acls
                }
            ]
    # -------------------------------------------------------------
    
    background_tasks.add_task(run_ansible_router, job_id, inventory_data, ansible_vars, tgt.vault_password)
    return {"status": "pending", "job_id": job_id, "message": f"Playbook Routeur lance pour {tgt.hostname}."}