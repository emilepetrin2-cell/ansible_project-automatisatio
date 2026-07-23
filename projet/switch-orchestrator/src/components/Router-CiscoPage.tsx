import { useState } from "react";
import { 
  isValidIPv4, 
  isValidNetmask, 
  normalizeWildcard, 
  isValidTimezone, 
  validateInterfaceName 
} from "../utils/validators";

interface NetworkInterfaceRouter {
  name: string;
  description: string;
  enabled: boolean;
  ip_address: string;
  netmask: string;
  ospf_enabled: boolean;
}

interface SubnetChoose {
  ip: string;
  wildcard_mask: string;
}

interface AceAdvanced {
  sequence: number;
  grant: "permit" | "deny";
  protocol: string;
  sourceType: "any" | "address";
  sourceAddress: string;
  sourceWildcard: string;
  destType: "any" | "address";
  destAddress: string;
  destWildcard: string;
  portEq?: string;
  tcpFin?: boolean;
  tcpAck?: boolean;
  tcpSyn?: boolean;
  tcpRst?: boolean;
}

interface AclBinding {
  name: string;
  acl: string;
  direction: "in" | "out";
}

interface DhcpPool {
  name: string;
  subnet_network: string;
  subnet_mask: string;
  default_router: string;
  dns_servers: string;
  tftp_enabled: boolean;
  tftp_ip: string;
}

interface DhcpHelperInterface {
  name: string;
  ip_helper: string;
}

export default function RouterPage({ backendUrl, userRole }: { backendUrl: string; userRole: string | null }) {
  // CONNEXION & SECURITE
  const [hostname, setHostname] = useState("");
  const [deviceIp, setDeviceIp] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [vaultPassword, setVaultPassword] = useState("");

  // ACTIVATION DES MODULES
  const [triggerBackup, setTriggerBackup] = useState(true);
  const [triggerHardening, setTriggerHardening] = useState(true);
  const [triggerBaseServices, setTriggerBaseServices] = useState(true);
  const [triggerInterfaces, setTriggerInterfaces] = useState(true);
  const [triggerRouting, setTriggerRouting] = useState(true);
  const [triggerNat, setTriggerNat] = useState(true);
  const [triggerAcls, setTriggerAcls] = useState(true);
  const [triggerDhcp, setTriggerDhcp] = useState(true);

  // M2 & M3: HARDENING & SERVICES
  const [managementSubnet, setManagementSubnet] = useState("10.254.0.0");
  const [managementWildcard, setManagementWildcard] = useState("0.0.255.255");
  const [ntpTimezone, setNtpTimezone] = useState("EST");
  const [ntpServer, setNtpServer] = useState("192.168.10.5");
  const [syslogServer, setSyslogServer] = useState("192.168.10.6");
  const [snmpGroup, setSnmpGroup] = useState("NOC_ADMIN");

  // M4: INTERFACES
  const [routerInterfaces, setRouterInterfaces] = useState<NetworkInterfaceRouter[]>([
    { name: "GigabitEthernet1", description: "Lien WAN Principal", enabled: true, ip_address: "dhcp", netmask: "", ospf_enabled: false },
    { name: "GigabitEthernet2", description: "LAN Bureautique", enabled: true, ip_address: "10.10.10.1", netmask: "255.255.255.0", ospf_enabled: true }
  ]);
  const [newRouterInt, setNewRouterInt] = useState<NetworkInterfaceRouter>({
    name: "", description: "", enabled: true, ip_address: "", netmask: "", ospf_enabled: false
  });
  const [intWarning, setIntWarning] = useState<string | null>(null);

  // M5: ROUTING
  const [enableOspf, setEnableOspf] = useState(true);
  const [ospfProcessId, setOspfProcessId] = useState("10");
  const [ospfRouterId, setOspfRouterId] = useState("1.1.1.1");
  const [ospfAreaId, setOspfAreaId] = useState("0");

  // M6: NAT
  const [interfaceNatOutside, setInterfaceNatOutside] = useState("GigabitEthernet1");
  const [interfacesNatInside, _setInterfacesNatInside] = useState<string[]>(["GigabitEthernet2"]);
  const [numberAcl, setNumberAcl] = useState("1");
  const [subnetChoose, setSubnetChoose] = useState<SubnetChoose[]>([
    { ip: "192.168.20.0", wildcard_mask: "0.0.0.255" }
  ]);

  // M7: ACLs & BINDINGS
  const [aclName, setAclName] = useState("SECURE_WEB_ACL");
  const [aces, setAces] = useState<AceAdvanced[]>([
    {
      sequence: 10,
      grant: "deny",
      protocol: "tcp",
      sourceType: "any",
      sourceAddress: "",
      sourceWildcard: "",
      destType: "any",
      destAddress: "",
      destWildcard: "",
      portEq: "www",
      tcpFin: true,
      tcpAck: true
    },
    {
      sequence: 20,
      grant: "permit",
      protocol: "ip",
      sourceType: "address",
      sourceAddress: "192.168.1.0",
      sourceWildcard: "0.0.0.255",
      destType: "any",
      destAddress: "",
      destWildcard: ""
    }
  ]);

  const [aclBindings, setAclBindings] = useState<AclBinding[]>([
    { name: "GigabitEthernet1", acl: "SECURE_WEB_ACL", direction: "out" }
  ]);

  // M8: DHCP
  const [dhcpPoolActive, setDhcpPoolActive] = useState(true);
  const [dhcpHelperActive, setDhcpHelperActive] = useState(false);
  const [excludeAddresses, _setExcludeAddresses] = useState<string[]>(["192.168.20.1", "192.168.20.10"]);
  const [dhcpPools, setDhcpPools] = useState<DhcpPool[]>([
    { name: "pool10", subnet_network: "192.168.20.0", subnet_mask: "255.255.255.0", default_router: "192.168.20.1", dns_servers: "8.8.8.8 1.1.1.1", tftp_enabled: true, tftp_ip: "192.168.10.5" }
  ]);
  const [dhcpHelpers, setDhcpHelpers] = useState<DhcpHelperInterface[]>([
    { name: "GigabitEthernet2", ip_helper: "10.0.0.254" }
  ]);

  // MODAL BACKUP
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupFiles, setBackupFiles] = useState<string[]>([]);
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [loadingBackups, setLoadingBackups] = useState(false);

  // ETATS DE DEPLOIEMENT & SUIVI
  const [isDeploying, setIsDeploying] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionSuccess, setExecutionSuccess] = useState<string | null>(null);

  const handleInterfaceNameChange = (name: string) => {
    setNewRouterInt({ ...newRouterInt, name });
    const check = validateInterfaceName(name);
    setIntWarning(check.warning || null);
  };

  const fetchBackups = async () => {
    if (!hostname) {
      setExecutionError("Veuillez d'abord specifier un Hostname dans la section Connexion.");
      return;
    }
    setLoadingBackups(true);
    try {
      const res = await fetch(`${backendUrl}/api/v1/backups/${hostname.trim()}`, {
        credentials: "include"
      });
      const data = await res.json();
      setBackupFiles(data.files || []);
      setShowBackupModal(true);
    } catch (err: any) {
      setExecutionError(`Erreur chargement backups : ${err.message}`);
    } finally {
      setLoadingBackups(false);
    }
  };

  const loadBackupContent = async (file: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/v1/backups/${hostname.trim()}/${file}`, {
        credentials: "include"
      });
      const data = await res.json();
      setSelectedFileContent(data.content);
    } catch (err: any) {
      setExecutionError(`Erreur lecture fichier : ${err.message}`);
    }
  };

  const handleDeploy = async () => {
    setExecutionError(null);
    setExecutionSuccess(null);

    if (!username || !password || !hostname || !deviceIp || !vaultPassword) {
      setExecutionError("Champs obligatoires manquants : Target Hostname, Device IP, SSH Username/Password et Vault Password.");
      return;
    }
    if (!isValidIPv4(deviceIp)) {
      setExecutionError(`L'adresse IP cible '${deviceIp}' est invalide.`);
      return;
    }

    if (triggerBaseServices) {
      if (ntpServer && !isValidIPv4(ntpServer)) {
        setExecutionError(`L'IP du serveur NTP '${ntpServer}' est invalide.`);
        return;
      }
      if (syslogServer && !isValidIPv4(syslogServer)) {
        setExecutionError(`L'IP du serveur Syslog '${syslogServer}' est invalide.`);
        return;
      }
      if (ntpTimezone && !isValidTimezone(ntpTimezone)) {
        setExecutionError(`La timezone '${ntpTimezone}' est invalide.`);
        return;
      }
    }

    if (triggerInterfaces) {
      for (const intf of routerInterfaces) {
        if (intf.ip_address !== "dhcp") {
          if (!isValidIPv4(intf.ip_address)) {
            setExecutionError(`L'IP '${intf.ip_address}' sur l'interface '${intf.name}' est invalide.`);
            return;
          }
          if (intf.netmask && !isValidNetmask(intf.netmask)) {
            setExecutionError(`Le masque '${intf.netmask}' sur l'interface '${intf.name}' est invalide.`);
            return;
          }
        }
      }
    }

    const formattedAcls = [
      {
        name: aclName,
        acl_type: "extended",
        aces: aces.map((ace) => {
          const aceObj: any = {
            sequence: ace.sequence,
            grant: ace.grant,
            protocol: ace.protocol
          };

          if (ace.sourceType === "address" && ace.sourceAddress) {
            aceObj.source = {
              address: ace.sourceAddress.trim(),
              wildcard_bits: normalizeWildcard(ace.sourceWildcard)
            };
          } else {
            aceObj.source = { any: true };
          }

          if (ace.destType === "address" && ace.destAddress) {
            aceObj.destination = {
              address: ace.destAddress.trim(),
              wildcard_bits: normalizeWildcard(ace.destWildcard)
            };
          } else {
            aceObj.destination = { any: true };
          }

          if (ace.portEq) {
            aceObj.destination.port_protocol = { eq: ace.portEq.trim() };
          }

          if (ace.protocol === "tcp" && (ace.tcpFin || ace.tcpAck || ace.tcpSyn || ace.tcpRst)) {
            aceObj.protocol_options = {
              tcp: {
                ...(ace.tcpFin && { fin: true }),
                ...(ace.tcpAck && { ack: true }),
                ...(ace.tcpSyn && { syn: true }),
                ...(ace.tcpRst && { rst: true })
              }
            };
          }

          return aceObj;
        })
      }
    ];

    const payload = {
      target: { 
        hostname: hostname.trim(), 
        vendor: "cisco", 
        username: username.trim(), 
        password, 
        device_ip: deviceIp.trim(),
        vault_password: vaultPassword
      },
      variables: {
        trigger_backup: triggerBackup,
        trigger_hardening: triggerHardening,
        trigger_base_services: triggerBaseServices,
        trigger_interfaces: triggerInterfaces,
        trigger_routing: triggerRouting,
        trigger_nat: triggerNat,
        trigger_acls: triggerAcls,
        trigger_dhcp: triggerDhcp,

        management_subnet: managementSubnet,
        management_wildcard: normalizeWildcard(managementWildcard),
        ntp_timezone: ntpTimezone,
        ntp_server: ntpServer,
        syslog_server: syslogServer,
        snmp_group: snmpGroup,

        network_interfaces: routerInterfaces,
        enable_ospf: enableOspf,
        ospf_process_id: parseInt(ospfProcessId) || 10,
        ospf_router_id: ospfRouterId,
        ospf_area_id: ospfAreaId,

        interface_nat_outside: interfaceNatOutside,
        interfaces_nat_inside: interfacesNatInside,
        number_acl: numberAcl,
        subnet_choose: subnetChoose.map(s => ({ ip: s.ip, wildcard_mask: normalizeWildcard(s.wildcard_mask) })),

        cisco_acls_config: formattedAcls,
        acl_bindings: aclBindings,

        dhcp_pool: dhcpPoolActive,
        dhcp_helper: dhcpHelperActive,
        exclude_address: excludeAddresses,
        dhcp_pools: dhcpPools.map(p => ({
          ...p,
          dns_server: p.dns_servers.split(" ")
        })),
        interfaces: dhcpHelpers
      }
    };

    setIsDeploying(true);

    try {
      const response = await fetch(`${backendUrl}/api/v1/deploy/router`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Erreur de deploiement");

      const jobId = data.job_id;
      let attempts = 0;
      
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch(`${backendUrl}/api/v1/status/${jobId}`, {
            credentials: "include"
          });
          const statusData = await statusRes.json();

          if (statusData.status === "failed") {
            clearInterval(checkInterval);
            setIsDeploying(false);
            setExecutionError(statusData.error || "Echec du playbook Routeur.");
          } else if (statusData.status === "success") {
            clearInterval(checkInterval);
            setIsDeploying(false);
            setExecutionSuccess(statusData.message || "Deploiement du routeur reussi !");
          }

          if (attempts >= 30) {
            clearInterval(checkInterval);
            setIsDeploying(false);
            setExecutionError("Delai depasse lors du suivi du playbook.");
          }
        } catch (e) {
          // Attente
        }
      }, 2000);

    } catch (err: any) {
      setIsDeploying(false);
      setExecutionError(`Erreur : ${err.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {executionError && (
        <div className="p-4 bg-red-950/80 border border-red-500/50 rounded-xl text-red-200 text-sm font-mono flex items-start space-x-3 shadow-lg">
          <span className="text-xl">🛑</span>
          <div>
            <strong className="block font-bold mb-1">Erreur de deploiement Routeur :</strong>
            <span>{executionError}</span>
          </div>
        </div>
      )}

      {executionSuccess && (
        <div className="p-4 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-200 text-sm font-mono flex items-center space-x-3 shadow-lg">
          <span className="text-xl">✅</span>
          <span>{executionSuccess}</span>
        </div>
      )}

      {/* CONNECTION & SECURITY */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
          <h2 className="text-sm font-mono uppercase text-blue-400 m-0">🔑 Cisco Router Connection & Security</h2>
          <button
            onClick={fetchBackups}
            className="bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs px-3 py-1.5 rounded-lg transition font-mono flex items-center gap-2 cursor-pointer"
          >
            📂 {loadingBackups ? "Chargement..." : "Voir Backups (.cfg)"}
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Target Hostname *</label>
            <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="ex: RTR-WAN-01" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Device IP Address *</label>
            <input type="text" value={deviceIp} onChange={(e) => setDeviceIp(e.target.value)} placeholder="ex: 192.168.1.1" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">SSH Username *</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ansible_user" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">SSH Password *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none" />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800/50">
          <label className="block text-xs text-slate-400 mb-1">Ansible Vault Password *</label>
          <input type="password" value={vaultPassword} onChange={(e) => setVaultPassword(e.target.value)} placeholder="Cle Vault" className="w-full md:w-1/2 bg-slate-950 border border-amber-600/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none" />
        </div>
      </section>

      {/* MODULE TRIGGERS */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-sm font-mono uppercase text-blue-400 mb-4 border-b border-slate-800 pb-2">⚙️ Playbook Modules Activation</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Backup (M1)", val: triggerBackup, set: setTriggerBackup },
            { label: "Hardening (M2)", val: triggerHardening, set: setTriggerHardening },
            { label: "Base Services (M3)", val: triggerBaseServices, set: setTriggerBaseServices },
            { label: "Interfaces (M4)", val: triggerInterfaces, set: setTriggerInterfaces },
            { label: "Routing OSPF (M5)", val: triggerRouting, set: setTriggerRouting },
            { label: "NAT Engine (M6)", val: triggerNat, set: setTriggerNat },
            { label: "Security ACLs (M7)", val: triggerAcls, set: setTriggerAcls },
            { label: "DHCP Server/Relay (M8)", val: triggerDhcp, set: setTriggerDhcp },
          ].map((m, i) => (
            <label key={i} className="flex items-center justify-between p-3 bg-slate-950/40 border border-slate-800 rounded-lg cursor-pointer">
              <span className="text-xs font-medium text-slate-300">{m.label}</span>
              <input type="checkbox" checked={m.val} onChange={(e) => m.set(e.target.checked)} className="rounded text-blue-500 h-4 w-4" />
            </label>
          ))}
        </div>
      </section>

      {/* HARDENING & SERVICES (M2 & M3) */}
      {(triggerHardening || triggerBaseServices) && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl grid grid-cols-1 md:grid-cols-2 gap-6">
          {triggerHardening && (
            <div className="space-y-4">
              <h3 className="text-xs font-mono uppercase text-cyan-400 border-b border-slate-800 pb-1">🔒 Hardening Parameters (M2)</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400">Mgmt Subnet</label>
                  <input type="text" value={managementSubnet} onChange={(e) => setManagementSubnet(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400">Mgmt Wildcard</label>
                  <input type="text" value={managementWildcard} onChange={(e) => setManagementWildcard(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
              </div>
            </div>
          )}

          {triggerBaseServices && (
            <div className="space-y-4">
              <h3 className="text-xs font-mono uppercase text-cyan-400 border-b border-slate-800 pb-1">🛠️ System Services (M3)</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400">NTP Server IP</label>
                  <input type="text" value={ntpServer} onChange={(e) => setNtpServer(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400">Syslog Server IP</label>
                  <input type="text" value={syslogServer} onChange={(e) => setSyslogServer(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400">NTP Timezone</label>
                  <input type="text" value={ntpTimezone} onChange={(e) => setNtpTimezone(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400">SNMPv3 Group Name</label>
                  <input type="text" value={snmpGroup} onChange={(e) => setSnmpGroup(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* INTERFACES ROUTEUR (M4) */}
      {triggerInterfaces && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
          <h2 className="text-sm font-mono uppercase text-blue-400 border-b border-slate-800 pb-2">🔌 L3 Routing Interfaces (M4)</h2>
          
          <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Name</label>
              <input type="text" placeholder="ex: GigabitEthernet3" value={newRouterInt.name} onChange={(e) => handleInterfaceNameChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">IP (ou 'dhcp')</label>
              <input type="text" placeholder="10.10.30.1" value={newRouterInt.ip_address} onChange={(e) => setNewRouterInt({...newRouterInt, ip_address: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Netmask</label>
              <input type="text" placeholder="255.255.255.0" value={newRouterInt.netmask} onChange={(e) => setNewRouterInt({...newRouterInt, netmask: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" disabled={newRouterInt.ip_address === "dhcp"} />
            </div>
            <div className="flex items-center space-x-2 pb-2">
              <input type="checkbox" id="newOspf" checked={newRouterInt.ospf_enabled} onChange={(e) => setNewRouterInt({...newRouterInt, ospf_enabled: e.target.checked})} className="rounded bg-slate-900 border-slate-700 text-blue-500" />
              <label htmlFor="newOspf" className="text-xs text-slate-300 cursor-pointer">OSPF Enable</label>
            </div>
            <button 
              onClick={() => {
                if(newRouterInt.name.trim().length >= 3 && newRouterInt.ip_address) {
                  setRouterInterfaces([...routerInterfaces, newRouterInt]);
                  setNewRouterInt({ name: "", description: "Generated via Web", enabled: true, ip_address: "", netmask: "", ospf_enabled: false });
                  setIntWarning(null);
                } else {
                  setIntWarning("Nom d'interface invalide ou IP manquante.");
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-1.5 rounded text-xs cursor-pointer"
            >
              + Add Interface
            </button>
          </div>

          {intWarning && (
            <p className="text-[11px] text-amber-400 font-mono bg-amber-950/40 p-2 rounded border border-amber-800/40">
              {intWarning}
            </p>
          )}

          <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950 text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-800/40 font-mono text-[11px] text-slate-400 border-b border-slate-800">
                  <th className="p-2.5 pl-4">Interface</th>
                  <th className="p-2.5">Description</th>
                  <th className="p-2.5">IP / Netmask</th>
                  <th className="p-2.5">OSPF Status</th>
                  <th className="p-2.5 text-right pr-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {routerInterfaces.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/30">
                    <td className="p-2.5 pl-4 font-mono font-bold text-slate-200">{item.name}</td>
                    <td className="p-2.5 text-slate-400 italic text-[11px]">{item.description}</td>
                    <td className="p-2.5 font-mono text-cyan-400">
                      {item.ip_address} {item.netmask && ` / ${item.netmask}`}
                    </td>
                    <td className="p-2.5">
                      {item.ospf_enabled 
                        ? <span className="bg-blue-950 border border-blue-900 text-blue-400 px-2 py-0.5 rounded text-[10px] font-bold">OSPF AREA {ospfAreaId}</span>
                        : <span className="bg-slate-800 text-slate-500 px-2 py-0.5 rounded text-[10px]">No Routing</span>
                      }
                    </td>
                    <td className="p-2.5 text-right pr-4">
                      <button onClick={() => setRouterInterfaces(routerInterfaces.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 text-[11px] cursor-pointer">✕ Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ROUTAGE OSPF (M5) */}
      {triggerRouting && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
          <h2 className="text-sm font-mono uppercase text-blue-400 border-b border-slate-800 pb-2">🌐 OSPF Protocol Configuration (M5)</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
            <label className="flex items-center space-x-2 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={enableOspf} onChange={(e) => setEnableOspf(e.target.checked)} className="rounded text-blue-600" />
              <span>Enable OSPF v2</span>
            </label>
            <div>
              <label className="block text-[11px] text-slate-400">Process ID</label>
              <input type="number" value={ospfProcessId} onChange={(e) => setOspfProcessId(e.target.value)} disabled={!enableOspf} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400">Router ID</label>
              <input type="text" value={ospfRouterId} onChange={(e) => setOspfRouterId(e.target.value)} disabled={!enableOspf} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400">Area ID</label>
              <input type="text" value={ospfAreaId} onChange={(e) => setOspfAreaId(e.target.value)} disabled={!enableOspf} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
            </div>
          </div>
        </section>
      )}

      {/* ENGINE NAT (M6) */}
      {triggerNat && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
          <h2 className="text-sm font-mono uppercase text-blue-400 border-b border-slate-800 pb-2">🔄 NAT & Inside/Outside Translation (M6)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">WAN Outside Interface</label>
              <input type="text" value={interfaceNatOutside} onChange={(e) => setInterfaceNatOutside(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">NAT Standard ACL Number</label>
              <input type="number" value={numberAcl} onChange={(e) => setNumberAcl(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Subnet Translation (IP & Wildcard)</label>
              <div className="flex gap-1">
                <input type="text" value={subnetChoose[0].ip} onChange={(e) => setSubnetChoose([{...subnetChoose[0], ip: e.target.value}])} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                <input type="text" value={subnetChoose[0].wildcard_mask} onChange={(e) => setSubnetChoose([{...subnetChoose[0], wildcard_mask: e.target.value}])} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* EXTENDED ACL BUILDER (M7) */}
      {triggerAcls && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <h2 className="text-sm font-mono uppercase text-blue-400 border-b border-slate-800 pb-2">🛡️ Extended ACL Builder & Binding (M7)</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">ACL Name</label>
              <input type="text" value={aclName} onChange={(e) => setAclName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-cyan-400" />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-mono uppercase text-slate-400">Access Control Entries (ACEs)</h3>
            {aces.map((ace, idx) => (
              <div key={idx} className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="font-mono text-blue-400 font-bold">Rule #{ace.sequence}</span>
                  <button onClick={() => setAces(aces.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 text-xs cursor-pointer">✕ Remove</button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400">Action</label>
                    <select value={ace.grant} onChange={(e) => { const u = [...aces]; u[idx].grant = e.target.value as any; setAces(u); }} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1">
                      <option value="permit">permit</option>
                      <option value="deny">deny</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400">Protocol</label>
                    <select value={ace.protocol} onChange={(e) => { const u = [...aces]; u[idx].protocol = e.target.value; setAces(u); }} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1">
                      <option value="ip">ip</option>
                      <option value="tcp">tcp</option>
                      <option value="udp">udp</option>
                      <option value="icmp">icmp</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400">Port (port_protocol.eq)</label>
                    <input type="text" placeholder="ex: www ou 80" value={ace.portEq || ""} onChange={(e) => { const u = [...aces]; u[idx].portEq = e.target.value; setAces(u); }} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-900">
                  <div className="space-y-1">
                    <span className="block text-[11px] text-cyan-400 font-mono">Source</span>
                    <div className="flex gap-2 items-center">
                      <label className="text-[11px]"><input type="radio" checked={ace.sourceType === "any"} onChange={() => { const u = [...aces]; u[idx].sourceType = "any"; setAces(u); }} /> Any</label>
                      <label className="text-[11px]"><input type="radio" checked={ace.sourceType === "address"} onChange={() => { const u = [...aces]; u[idx].sourceType = "address"; setAces(u); }} /> Address</label>
                    </div>
                    {ace.sourceType === "address" && (
                      <div className="flex gap-1">
                        <input type="text" placeholder="192.168.1.0" value={ace.sourceAddress} onChange={(e) => { const u = [...aces]; u[idx].sourceAddress = e.target.value; setAces(u); }} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1" />
                        <input type="text" placeholder="0.0.0.255" value={ace.sourceWildcard} onChange={(e) => { const u = [...aces]; u[idx].sourceWildcard = e.target.value; setAces(u); }} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="block text-[11px] text-cyan-400 font-mono">Destination</span>
                    <div className="flex gap-2 items-center">
                      <label className="text-[11px]"><input type="radio" checked={ace.destType === "any"} onChange={() => { const u = [...aces]; u[idx].destType = "any"; setAces(u); }} /> Any</label>
                      <label className="text-[11px]"><input type="radio" checked={ace.destType === "address"} onChange={() => { const u = [...aces]; u[idx].destType = "address"; setAces(u); }} /> Address</label>
                    </div>
                    {ace.destType === "address" && (
                      <div className="flex gap-1">
                        <input type="text" placeholder="10.0.0.0" value={ace.destAddress} onChange={(e) => { const u = [...aces]; u[idx].destAddress = e.target.value; setAces(u); }} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1" />
                        <input type="text" placeholder="0.0.0.255" value={ace.destWildcard} onChange={(e) => { const u = [...aces]; u[idx].destWildcard = e.target.value; setAces(u); }} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1" />
                      </div>
                    )}
                  </div>
                </div>

                {ace.protocol === "tcp" && (
                  <div className="pt-2 border-t border-slate-900 flex items-center gap-4">
                    <span className="text-[11px] text-amber-400 font-mono">TCP Flags:</span>
                    {["fin", "ack", "syn", "rst"].map((flag) => (
                      <label key={flag} className="text-[11px] flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(ace as any)[`tcp${flag.toUpperCase()}`] || false}
                          onChange={(e) => {
                            const u = [...aces];
                            (u[idx] as any)[`tcp${flag.toUpperCase()}`] = e.target.checked;
                            setAces(u);
                          }}
                        />
                        {flag.toUpperCase()}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={() => setAces([...aces, { sequence: (aces.length + 1) * 10, grant: "permit", protocol: "ip", sourceType: "any", sourceAddress: "", sourceWildcard: "", destType: "any", destAddress: "", destWildcard: "" }])}
              className="bg-slate-800 hover:bg-slate-700 text-xs text-blue-400 px-3 py-1.5 rounded cursor-pointer"
            >
              + Add Rule (ACE)
            </button>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-mono uppercase text-amber-400">Associate ACLs to Interfaces (acl_bindings)</h3>
            {aclBindings.map((b, idx) => (
              <div key={idx} className="flex gap-3 items-center text-xs bg-slate-950/40 p-3 rounded-lg border border-slate-800">
                <input
                  type="text"
                  placeholder="Interface (ex: GigabitEthernet1)"
                  value={b.name}
                  onChange={(e) => { const u = [...aclBindings]; u[idx].name = e.target.value; setAclBindings(u); }}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 w-1/3 text-slate-200"
                />
                <input
                  type="text"
                  placeholder="ACL Name"
                  value={b.acl}
                  onChange={(e) => { const u = [...aclBindings]; u[idx].acl = e.target.value; setAclBindings(u); }}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 w-1/3 text-cyan-400 font-mono"
                />
                <select
                  value={b.direction}
                  onChange={(e) => { const u = [...aclBindings]; u[idx].direction = e.target.value as any; setAclBindings(u); }}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1"
                >
                  <option value="in">in</option>
                  <option value="out">out</option>
                </select>
                <button
                  onClick={() => setAclBindings(aclBindings.filter((_, i) => i !== idx))}
                  className="text-red-400 hover:text-red-300 text-xs cursor-pointer ml-auto"
                >
                  ✕ Remove Binding
                </button>
              </div>
            ))}
            <button
              onClick={() => setAclBindings([...aclBindings, { name: "GigabitEthernet1", acl: aclName, direction: "in" }])}
              className="text-xs text-amber-400 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded cursor-pointer"
            >
              + Bind ACL to Interface
            </button>
          </div>
        </section>
      )}

      {/* DHCP SERVER & RELAY (M8) */}
      {triggerDhcp && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <h2 className="text-sm font-mono uppercase text-blue-400 border-b border-slate-800 pb-2">📡 DHCP Server & DHCP Relay / Helper (M8)</h2>
          
          <div className="flex gap-6 border-b border-slate-800 pb-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={dhcpPoolActive} onChange={(e) => setDhcpPoolActive(e.target.checked)} className="rounded text-blue-500" />
              <span>Enable Local DHCP Pools (`dhcp_pool`)</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={dhcpHelperActive} onChange={(e) => setDhcpHelperActive(e.target.checked)} className="rounded text-cyan-500" />
              <span>Enable DHCP Relay (`dhcp_helper`)</span>
            </label>
          </div>

          {dhcpPoolActive && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-mono uppercase text-blue-400">Local DHCP Pools Configuration</h3>
                <button
                  onClick={() => setDhcpPools([...dhcpPools, { name: `pool${dhcpPools.length + 10}`, subnet_network: "192.168.30.0", subnet_mask: "255.255.255.0", default_router: "192.168.30.1", dns_servers: "8.8.8.8", tftp_enabled: false, tftp_ip: "" }])}
                  className="bg-blue-600/20 border border-blue-500 text-blue-400 text-xs px-3 py-1 rounded hover:bg-blue-600/30 transition cursor-pointer"
                >
                  + Add DHCP Pool
                </button>
              </div>

              {dhcpPools.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Aucun pool DHCP configure.</p>
              ) : (
                dhcpPools.map((pool, idx) => (
                  <div key={idx} className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs relative">
                    <div className="sm:col-span-3 flex justify-between items-center border-b border-slate-800/80 pb-2 mb-1">
                      <span className="font-mono text-blue-400 font-bold">Pool #{idx + 1}</span>
                      <button
                        onClick={() => setDhcpPools(dhcpPools.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-300 text-[11px] font-mono bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 px-2 py-0.5 rounded cursor-pointer"
                      >
                        ✕ Supprimer ce pool
                      </button>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Pool Name</label>
                      <input type="text" value={pool.name} onChange={(e) => {
                        const updated = [...dhcpPools]; updated[idx].name = e.target.value; setDhcpPools(updated);
                      }} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Subnet Network & Mask</label>
                      <div className="flex gap-1">
                        <input type="text" value={pool.subnet_network} onChange={(e) => {
                          const updated = [...dhcpPools]; updated[idx].subnet_network = e.target.value; setDhcpPools(updated);
                        }} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1" />
                        <input type="text" value={pool.subnet_mask} onChange={(e) => {
                          const updated = [...dhcpPools]; updated[idx].subnet_mask = e.target.value; setDhcpPools(updated);
                        }} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Default Router (Gateway)</label>
                      <input type="text" value={pool.default_router} onChange={(e) => {
                        const updated = [...dhcpPools]; updated[idx].default_router = e.target.value; setDhcpPools(updated);
                      }} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-slate-400 mb-1">DNS Servers (Separes par un espace)</label>
                      <input type="text" value={pool.dns_servers} onChange={(e) => {
                        const updated = [...dhcpPools]; updated[idx].dns_servers = e.target.value; setDhcpPools(updated);
                      }} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-cyan-400" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">TFTP Option 150 (VoIP)</label>
                      <div className="flex gap-1 items-center">
                        <input type="checkbox" checked={pool.tftp_enabled} onChange={(e) => {
                          const updated = [...dhcpPools]; updated[idx].tftp_enabled = e.target.checked; setDhcpPools(updated);
                        }} className="rounded h-4 w-4 text-blue-500 bg-slate-900 border-slate-700" />
                        <input type="text" placeholder="192.168.10.5" value={pool.tftp_ip} onChange={(e) => {
                          const updated = [...dhcpPools]; updated[idx].tftp_ip = e.target.value; setDhcpPools(updated);
                        }} disabled={!pool.tftp_enabled} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {dhcpHelperActive && (
            <div className="space-y-3 bg-slate-950/40 p-4 rounded-lg border border-cyan-900/40">
              <h3 className="text-xs font-mono uppercase text-cyan-400">Configure DHCP Helper (ip helper-address)</h3>
              {dhcpHelpers.map((h, i) => (
                <div key={i} className="flex gap-3 items-center text-xs">
                  <input type="text" placeholder="Interface (ex: GigabitEthernet2)" value={h.name} onChange={(e) => { const u = [...dhcpHelpers]; u[i].name = e.target.value; setDhcpHelpers(u); }} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 w-1/2" />
                  <input type="text" placeholder="Helper IP (ex: 10.0.0.254)" value={h.ip_helper} onChange={(e) => { const u = [...dhcpHelpers]; u[i].ip_helper = e.target.value; setDhcpHelpers(u); }} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 w-1/2" />
                  <button onClick={() => setDhcpHelpers(dhcpHelpers.filter((_, idx) => idx !== i))} className="text-red-400 text-xs cursor-pointer">✕</button>
                </div>
              ))}
              <button onClick={() => setDhcpHelpers([...dhcpHelpers, { name: "", ip_helper: "" }])} className="text-xs text-cyan-400 bg-slate-900 px-2 py-1 rounded cursor-pointer">+ Add Helper Interface</button>
            </div>
          )}
        </section>
      )}

      {/* MODAL BACKUP */}
      {showBackupModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-mono text-cyan-400">📁 Backups (.cfg) - {hostname}</h3>
              <button onClick={() => { setShowBackupModal(false); setSelectedFileContent(null); }} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 overflow-hidden">
              <div className="border border-slate-800 rounded-lg p-2 bg-slate-950 overflow-y-auto space-y-1">
                {backupFiles.length === 0 ? (
                  <p className="text-xs text-slate-500 p-2">Aucun backup trouve pour cet hote.</p>
                ) : (
                  backupFiles.map((file) => (
                    <button
                      key={file}
                      onClick={() => loadBackupContent(file)}
                      className="w-full text-left text-xs font-mono p-2 rounded hover:bg-slate-800 text-slate-300 transition block truncate cursor-pointer"
                    >
                      📄 {file}
                    </button>
                  ))
                )}
              </div>

              <div className="md:col-span-2 border border-slate-800 rounded-lg p-3 bg-slate-950 overflow-y-auto font-mono text-xs text-emerald-400 whitespace-pre">
                {selectedFileContent ? selectedFileContent : <span className="text-slate-600">Selectionnez un fichier .cfg pour voir la configuration.</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between shadow-2xl">
        <span className="text-xs text-slate-400">
          {userRole === "auditor" ? (
            <span className="text-amber-400 font-bold">👁️ Mode Audit (Lecture Seule)</span>
          ) : (
            <span className="text-emerald-400 font-bold">✓ Ready : Session {userRole?.toUpperCase()} active</span>
          )}
        </span>

        <button
          onClick={handleDeploy}
          disabled={isDeploying || userRole === "auditor"}
          className={`bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold px-8 py-3 rounded-lg text-sm transition shadow-lg ${
            isDeploying || userRole === "auditor" ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          {userRole === "auditor" ? "Action non autorisee (Auditor)" : isDeploying ? "Lancement du Playbook..." : "Push Router Playbook"}
        </button>
      </footer>

    </div>
  );
}