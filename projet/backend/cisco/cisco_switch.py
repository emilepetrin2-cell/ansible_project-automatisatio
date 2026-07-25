# /home/elpetrino/projet/backend/cisco/cisco_switch.py
import os
import json
import tempfile
import ipaddress
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, List
from sqlalchemy.orm import Session

from tasks import run_ansible_task
from database import get_db, ExecutionLogModel
from dependencies import get_current_user

router = APIRouter()
PROJECT_DIR = os.getenv("PROJECT_DIR", "/app")

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

@router.post("/switch")
async def deploy_switch(
    payload: SwitchDeployRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
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

    # Generation dynamique du fichier d'inventaire temporaire
    inv_content = (
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
        f"          ansible_host_key_checking: false\n"
    )

    inv_file = tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False)
    inv_file.write(inv_content)
    inv_file.flush()
    inv_file.close()

    # Transfert des arguments extra_vars pour le playbook Ansible
    extra_vars = {
        "inventory_path": inv_file.name,
        "vault_password": payload.vault_password,
        **ansible_vars
    }

    # Initialisation du log d'audit dans la BDD
    new_log = ExecutionLogModel(
        task_id="PENDING",
        username=current_user.get("username", "unknown"),
        action_type="deploy_switch",
        target_host=clean_hostname,
        status="PENDING"
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    # Execution asynchrone via Celery / Redis
    playbook_file = f"{PROJECT_DIR}/site.yml"
    task = run_ansible_task.delay(playbook_file, extra_vars, log_id=new_log.id)

    return {
        "status": "pending",
        "job_id": task.id,
        "log_id": new_log.id,
        "message": f"Playbook Switch lance pour {clean_hostname}."
    }