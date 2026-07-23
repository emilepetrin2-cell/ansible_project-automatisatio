import os
import sys
import re
import yaml
from netmiko import ConnectHandler

if len(sys.argv) < 3:
    print("Erreur : Le script requiert le nom du switch et son adresse IP en arguments.")
    sys.exit(1)

nom_switch = sys.argv[1]
ip_switch = sys.argv[2]

chemin_script = os.path.dirname(os.path.abspath(__file__))
chemin_yaml = os.path.join(chemin_script, f'../host_vars/{nom_switch}.yml')

try:
    with open(chemin_yaml, 'r') as file:
        ansible_vars = yaml.safe_load(file)
except FileNotFoundError:
    print(f"Erreur : Impossible de trouver le fichier de configuration a : {chemin_yaml}")
    sys.exit(1)

access_ports_raw = ansible_vars.get('access_port', []) if ansible_vars else []
trunk_ports_raw = ansible_vars.get('trunk_port', []) if ansible_vars else []

ports_utiliser = []
for port in access_ports_raw:
    if 'name' in port:
        ports_utiliser.append(port['name'])
for port in trunk_ports_raw:
    if 'name' in port:
        ports_utiliser.append(port['name'])

pattern = re.compile(r"GigabitEthernet\S+")
all_ports = []
commandes_configuration = []

switch = {
    'device_type': 'cisco_ios',
    'ip': ip_switch,             # Utilise l'IP fournie par Ansible
    'username': 'elpetrino',
    'password': 'kali',
}
# 4. Connexion SSH et execution de l'algorithme de Blackholing
try:
    with ConnectHandler(**switch) as net_connect:
        print("connecting to device successfully")
        output = net_connect.send_command('show ip int brief')
        print("\n--- tat actuel des interfaces ---")
        print(output)
        
        # Extraction de toutes les interfaces physiques relles
        interfaces = pattern.findall(output)
        for port in interfaces:
            all_ports.append(port)

        # Calcul de la diffrence (Soustraction d'ensembles)
        port_non = set(all_ports) - set(ports_utiliser)
        
        # Protection stricte de ton interface de gestion
        port_non.discard("GigabitEthernet0/0")  
        
        # Gnration du bloc de commandes pour les ports orphelins
        for port in port_non:
            commandes_configuration.append(f"interface {port}")
            commandes_configuration.append("switchport access vlan 999")
            commandes_configuration.append("shutdown")
            
        # Envoi group des configurations au switch
        if commandes_configuration:
            print("\n--- Application du Blackholing ---")
            print(f"Envoi de la configuration pour {len(port_non)} ports inutilises...")
            resultat = net_connect.send_config_set(commandes_configuration)
            print(resultat)
        else:
            print("\nChangement inutile : Aucun port inutilise a configurer.")
            
except Exception as e:
    print(f"\nErreur lors de l'excution ou de la connexion SSH : {e}")