# /home/elpetrino/projet/backend/cisco/cisco_router.py
import os
import json
import tempfile
import ipaddress
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any
from sqlalchemy.orm import Session

from tasks import run_ansible_task
from database import get_db, ExecutionLogModel
from dependencies import get_current_user

router = APIRouter()
PROJECT_DIR = os.getenv("PROJECT_DIR", "/app")

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

@router.post("/router")
async def deploy_router(
    payload: RouterDeployRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    validate_router_payload(payload)

    tgt = payload.target
    clean_hostname = tgt.hostname.strip()

    inventory_content = (
        f"all:\n"
        f"  children:\n"
        f"    routers:\n"
        f"      hosts:\n"
        f"        {clean_hostname}:\n"
        f"          ansible_host: {tgt.device_ip.strip()}\n"
        f"          ansible_user: {tgt.username.strip()}\n"
        f"          ansible_ssh_pass: {tgt.password.strip()}\n"
        f"          ansible_network_os: cisco.ios.ios\n"
        f"          ansible_connection: network_cli\n"
        f"          ansible_host_key_checking: false\n"
    )
    
    inv_file = tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False)
    inv_file.write(inventory_content)
    inv_file.flush()
    inv_file.close()

    ansible_vars = payload.variables
    ansible_vars["hostname"] = clean_hostname

    raw_acls = ansible_vars.get("cisco_acls_config", [])
    if raw_acls and isinstance(raw_acls, list) and len(raw_acls) > 0:
        if "afi" not in raw_acls[0]:
            ansible_vars["cisco_acls_config"] = [
                {
                    "afi": "ipv4",
                    "acls": raw_acls
                }
            ]
            
    extra_vars = {
        "inventory_path": inv_file.name,
        "vault_password": tgt.vault_password,
        **ansible_vars
    }

    # Initialisation du log d'audit dans la BDD
    new_log = ExecutionLogModel(
        task_id="PENDING",
        username=current_user.get("username", "unknown"),
        action_type="deploy_router",
        target_host=clean_hostname,
        status="PENDING"
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    playbook_file = f"{PROJECT_DIR}/site.yml"
    task = run_ansible_task.delay(playbook_file, extra_vars, log_id=new_log.id)
    return {
        "status": "pending",
        "job_id": task.id,
        "log_id": new_log.id,
        "message": f"Playbook Routeur lance pour {clean_hostname}."
    }