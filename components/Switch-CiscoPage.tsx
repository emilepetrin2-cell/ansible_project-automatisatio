import { useState } from "react";
import { isValidIPv4, isValidNetmask } from "../utils/validators";

interface VlanItem {
  id: string;
  name: string;
}

interface InterfaceAccess {
  name: string;
  vlanId: string;
  dhcpSnooping: boolean;
  stormControl: boolean;
  stormUnicast: string;
  stormBroadcast: string;
  stormMulticast: string;
  portSecurity: boolean;
  maxMac: string;
  blackholing: boolean;
}

interface InterfaceTrunk {
  name: string;
  dhcpTrust: boolean;
  stormControl: boolean;
  stormUnicast: string;
  stormBroadcast: string;
  stormMulticast: string;
}

export default function SwitchPage({ backendUrl }: { backendUrl: string }) {
  // CONNEXION & SECURITE
  const [hostname, setHostname] = useState("");
  const [deviceIp, setDeviceIp] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [vaultPassword, setVaultPassword] = useState("");

  // System Parameters
  const [ntpServer, setNtpServer] = useState("");

  // VLANs
  const [vlanList, setVlanList] = useState<VlanItem[]>([
    { id: "30", name: "management" }
  ]);
  const [vlanInputId, setVlanInputId] = useState("");
  const [vlanInputName, setVlanInputName] = useState("");
  const [vlanError, setVlanError] = useState("");

  // Interfaces Access
  const [accessInterfaces, setAccessInterfaces] = useState<InterfaceAccess[]>([]);
  const [newAccess, setNewAccess] = useState<InterfaceAccess>({
    name: "", vlanId: "", dhcpSnooping: false, stormControl: false,
    stormUnicast: "10.0", stormBroadcast: "10.0", stormMulticast: "10.0",
    portSecurity: false, maxMac: "2", blackholing: false
  });
  const [accessError, setAccessError] = useState("");

  // Interfaces Trunk
  const [trunkInterfaces, setTrunkInterfaces] = useState<InterfaceTrunk[]>([]);
  const [newTrunk, setNewTrunk] = useState<InterfaceTrunk>({
    name: "", dhcpTrust: true, stormControl: false,
    stormUnicast: "10.0", stormBroadcast: "10.0", stormMulticast: "10.0"
  });
  const [trunkError, setTrunkError] = useState("");

  // SVI Management
  const [mgmtIp, setMgmtIp] = useState("");
  const [mgmtMask, setMgmtMask] = useState("");
  const [mgmtVlan, setMgmtVlan] = useState("");
  const [mgmtGateway, setMgmtGateway] = useState("");

  // Save State
  const [saveAfterChange, setSaveAfterChange] = useState(false);

  // ETATS DE DEPLOIEMENT & SUIVI
  const [isDeploying, setIsDeploying] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionSuccess, setExecutionSuccess] = useState<string | null>(null);

  const handleAddVlan = () => {
    setVlanError("");
    if (!vlanInputId || !vlanInputName) {
      setVlanError("L'ID et le Nom du VLAN sont obligatoires.");
      return;
    }
    const vIdNum = parseInt(vlanInputId, 10);
    if (isNaN(vIdNum) || vIdNum < 1 || vIdNum > 4094) {
      setVlanError("L'ID du VLAN doit etre compris entre 1 et 4094.");
      return;
    }
    if (vlanList.some(v => v.id === vlanInputId)) {
      setVlanError(`Le VLAN ${vlanInputId} existe deja ! Aucun doublon permis.`);
      return;
    }
    setVlanList([...vlanList, { id: vlanInputId, name: vlanInputName }]);
    setVlanInputId("");
    setVlanInputName("");
  };

  const handleRemoveVlan = (id: string) => {
    setVlanList(vlanList.filter(v => v.id !== id));
  };

  const handleAddAccessInterface = () => {
    setAccessError("");
    if (!newAccess.name || !newAccess.vlanId) {
      setAccessError("Le nom de l'interface et le VLAN sont requis.");
      return;
    }
    if (!vlanList.some(v => v.id === newAccess.vlanId)) {
      setAccessError(`Erreur : Le VLAN ${newAccess.vlanId} doit etre cree dans la section Systeme d'abord.`);
      return;
    }

    setAccessInterfaces([...accessInterfaces, newAccess]);
    setNewAccess({
      name: "", vlanId: "", dhcpSnooping: false, stormControl: false,
      stormUnicast: "10.0", stormBroadcast: "10.0", stormMulticast: "10.0",
      portSecurity: false, maxMac: "2", blackholing: false
    });
  };

  const handleRemoveAccessInterface = (index: number) => {
    setAccessInterfaces(accessInterfaces.filter((_, i) => i !== index));
  };

  const handleAddTrunkInterface = () => {
    setTrunkError("");
    if (!newTrunk.name) {
      setTrunkError("Le nom de l'interface Trunk est requis.");
      return;
    }
    setTrunkInterfaces([...trunkInterfaces, newTrunk]);
    setNewTrunk({
      name: "", dhcpTrust: true, stormControl: false,
      stormUnicast: "10.0", stormBroadcast: "10.0", stormMulticast: "10.0"
    });
  };

  const handleRemoveTrunkInterface = (index: number) => {
    setTrunkInterfaces(trunkInterfaces.filter((_, i) => i !== index));
  };

  const handleDeploy = async () => {
    setExecutionError(null);
    setExecutionSuccess(null);

    // 1. Validation de la connexion SSH / Vault
    if (!username || !password || !hostname || !deviceIp || !vaultPassword) {
      setExecutionError("Champs obligatoires manquants : Target Hostname, Device IP, SSH Username/Password et Vault Password.");
      return;
    }
    if (!isValidIPv4(deviceIp)) {
      setExecutionError(`L'adresse IP cible '${deviceIp}' est invalide.`);
      return;
    }

    // 2. Validation NTP
    if (ntpServer && !isValidIPv4(ntpServer)) {
      setExecutionError(`L'IP du serveur NTP '${ntpServer}' est invalide.`);
      return;
    }

    // 3. Validation SVI Management
    if (mgmtIp && !isValidIPv4(mgmtIp)) {
      setExecutionError(`L'IP de gestion SVI '${mgmtIp}' est invalide.`);
      return;
    }
    if (mgmtMask && !isValidNetmask(mgmtMask)) {
      setExecutionError(`Le masque de gestion SVI '${mgmtMask}' est invalide.`);
      return;
    }

    const payload = {
      vendor: "cisco",
      ssh: { username: username.trim(), password },
      device_ip: deviceIp.trim(),
      vault_password: vaultPassword,
      system: { hostname: hostname.trim(), ntpServer: ntpServer.trim(), vlans: vlanList },
      interfaces: { access: accessInterfaces, trunk: trunkInterfaces },
      management: { ip: mgmtIp.trim(), mask: mgmtMask.trim(), vlan: mgmtVlan, gateway: mgmtGateway.trim() },
      save_configuration: saveAfterChange
    };

    setIsDeploying(true);

    try {
      const response = await fetch(`${backendUrl}/api/v1/deploy/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Erreur HTTP ${response.status}`);

      const jobId = data.job_id;
      let attempts = 0;
      
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch(`${backendUrl}/api/v1/status/${jobId}`);
          const statusData = await statusRes.json();

          if (statusData.status === "failed") {
            clearInterval(checkInterval);
            setIsDeploying(false);
            setExecutionError(statusData.error || "Echec du playbook Switch.");
          } else if (statusData.status === "success") {
            clearInterval(checkInterval);
            setIsDeploying(false);
            setExecutionSuccess(statusData.message || "Deploiement du Switch reussi !");
          }

          if (attempts >= 30) {
            clearInterval(checkInterval);
            setIsDeploying(false);
            setExecutionError("Delai depasse lors du suivi du playbook.");
          }
        } catch (e) {
          // Attente temporaire
        }
      }, 2000);

    } catch (error: any) {
      setIsDeploying(false);
      setExecutionError(`Erreur reseau/serveur : ${error.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* BANNIERES DE FEEDBACK */}
      {executionError && (
        <div className="p-4 bg-red-950/80 border border-red-500/50 rounded-xl text-red-200 text-sm font-mono flex items-start space-x-3 shadow-lg">
          <span className="text-xl">🛑</span>
          <div>
            <strong className="block font-bold mb-1">Erreur de deploiement Switch :</strong>
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

      {/* CONNEXION & SECURITY */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
        <div className="border-b border-slate-800 pb-2">
          <h2 className="text-sm font-mono uppercase text-blue-400 m-0">🔑 Cisco Switch Connection & Security</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Target Hostname *</label>
            <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="ex: SW-CORE-01" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Device IP Address *</label>
            <input type="text" value={deviceIp} onChange={(e) => setDeviceIp(e.target.value)} placeholder="ex: 192.168.1.10" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">SSH Username *</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ansible_user" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">SSH Password *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/50">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ansible Vault Password *</label>
            <input type="password" value={vaultPassword} onChange={(e) => setVaultPassword(e.target.value)} placeholder="Cle Vault" className="w-full bg-slate-950 border border-amber-600/50 focus:border-amber-500 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none" />
          </div>
        </div>
      </section>

      {/* SYSTEM PARAMETERS & VLANS */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-sm font-mono uppercase tracking-wider text-blue-400 mb-4 border-b border-slate-800 pb-2">⚙️ System Parameters</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">NTP Server (IP Valide)</label>
              <input 
                type="text" 
                value={ntpServer}
                onChange={(e) => setNtpServer(e.target.value)}
                placeholder="ex: 192.168.10.5"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 space-y-3">
            <span className="block text-xs font-semibold text-slate-300">Ajouter un VLAN</span>
            <div className="grid grid-cols-2 gap-2">
              <input 
                type="number" 
                placeholder="ID (ex: 10)" 
                value={vlanInputId}
                onChange={(e) => setVlanInputId(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
              />
              <input 
                type="text" 
                placeholder="Nom (ex: DATA)" 
                value={vlanInputName}
                onChange={(e) => setVlanInputName(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
              />
            </div>
            <button 
              onClick={handleAddVlan}
              className="w-full bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded py-1.5 text-xs font-medium hover:bg-emerald-600/30 transition cursor-pointer"
            >
              + Ajouter au tableau
            </button>
            {vlanError && <p className="text-[11px] text-red-400 font-mono">{vlanError}</p>}
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800/50 text-[11px] font-mono uppercase text-slate-400 border-b border-slate-800">
                  <th className="p-2 pl-3">VLAN ID</th>
                  <th className="p-2">Name</th>
                  <th className="p-2 text-right pr-3">Action</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-800">
                {vlanList.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-3 text-center text-slate-500 italic">Aucun VLAN cree</td>
                  </tr>
                ) : (
                  vlanList.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-900/50">
                      <td className="p-2 pl-3 font-mono text-cyan-400">{v.id}</td>
                      <td className="p-2 text-slate-300 capitalize">{v.name}</td>
                      <td className="p-2 text-right pr-3">
                        <button
                          onClick={() => handleRemoveVlan(v.id)}
                          className="text-red-400 hover:text-red-300 text-[10px] font-mono bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 px-1.5 py-0.5 rounded cursor-pointer"
                        >
                          ✕ Supprimer
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* INTERFACES */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
        <h2 className="text-sm font-mono uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-2">🔌 Interfaces Management</h2>
        
        {/* ACCESS INTERFACES */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Interface Mode Access</h3>
          
          <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Interface Name</label>
                <input 
                  type="text" 
                  placeholder="ex: GigabitEthernet0/1"
                  value={newAccess.name}
                  onChange={(e) => setNewAccess({...newAccess, name: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Access VLAN (Doit exister)</label>
                <input 
                  type="number" 
                  placeholder="ex: 30"
                  value={newAccess.vlanId}
                  onChange={(e) => setNewAccess({...newAccess, vlanId: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200"
                />
              </div>
              <div className="flex items-end">
                <button 
                  onClick={handleAddAccessInterface}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded py-1.5 text-xs font-medium transition cursor-pointer shadow-md shadow-blue-600/10"
                >
                  Add Access Interface
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-800/60">
              <label className="flex items-center space-x-2 text-xs cursor-pointer text-slate-300">
                <input type="checkbox" checked={newAccess.dhcpSnooping} onChange={(e) => setNewAccess({...newAccess, dhcpSnooping: e.target.checked})} className="rounded bg-slate-900 border-slate-700 text-blue-500" />
                <span>DHCP Snooping</span>
              </label>
              <label className="flex items-center space-x-2 text-xs cursor-pointer text-slate-300">
                <input type="checkbox" checked={newAccess.stormControl} onChange={(e) => setNewAccess({...newAccess, stormControl: e.target.checked})} className="rounded bg-slate-900 border-slate-700 text-blue-500" />
                <span>Storm Control</span>
              </label>
              <label className="flex items-center space-x-2 text-xs cursor-pointer text-slate-300">
                <input type="checkbox" checked={newAccess.portSecurity} onChange={(e) => setNewAccess({...newAccess, portSecurity: e.target.checked})} className="rounded bg-slate-900 border-slate-700 text-blue-500" />
                <span>Port Security</span>
              </label>
              <label className="flex items-center space-x-2 text-xs cursor-pointer text-slate-300">
                <input type="checkbox" checked={newAccess.blackholing} onChange={(e) => setNewAccess({...newAccess, blackholing: e.target.checked})} className="rounded bg-slate-900 border-slate-700 text-blue-500" />
                <span>Blackholing</span>
              </label>
            </div>

            {newAccess.stormControl && (
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 grid grid-cols-3 gap-2 animate-fadeIn">
                <span className="col-span-3 text-[11px] font-mono text-cyan-400">⚡ Storm Control Levels (%) :</span>
                <div>
                  <label className="block text-[10px] text-slate-400">Unicast</label>
                  <input type="text" value={newAccess.stormUnicast} onChange={(e) => setNewAccess({...newAccess, stormUnicast: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">Broadcast</label>
                  <input type="text" value={newAccess.stormBroadcast} onChange={(e) => setNewAccess({...newAccess, stormBroadcast: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">Multicast</label>
                  <input type="text" value={newAccess.stormMulticast} onChange={(e) => setNewAccess({...newAccess, stormMulticast: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
              </div>
            )}

            {newAccess.portSecurity && (
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 max-w-xs animate-fadeIn">
                <label className="block text-[11px] font-mono text-cyan-400 mb-1">🔒 Max MAC Addresses per port :</label>
                <input type="number" value={newAccess.maxMac} onChange={(e) => setNewAccess({...newAccess, maxMac: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
              </div>
            )}

            {accessError && <p className="text-xs text-red-400 font-mono">{accessError}</p>}
          </div>

          {accessInterfaces.length > 0 && (
            <div className="border border-slate-800 rounded-lg overflow-hidden text-xs bg-slate-950">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-800/40 text-[10px] font-mono uppercase text-slate-400 border-b border-slate-800">
                    <th className="p-2 pl-3">Port</th>
                    <th className="p-2">VLAN</th>
                    <th className="p-2">Securities Active</th>
                    <th className="p-2 text-right pr-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {accessInterfaces.map((int, idx) => (
                    <tr key={idx} className="border-b border-slate-900 hover:bg-slate-900/30">
                      <td className="p-2 pl-3 font-mono text-slate-200">{int.name}</td>
                      <td className="p-2 text-cyan-400 font-bold">{int.vlanId}</td>
                      <td className="p-2 space-x-1">
                        {int.dhcpSnooping && <span className="bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded text-[10px]">Snooping</span>}
                        {int.stormControl && <span className="bg-blue-950 text-blue-400 border border-blue-900 px-1.5 py-0.5 rounded text-[10px]">Storm ({int.stormBroadcast}%)</span>}
                        {int.portSecurity && <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 py-0.5 rounded text-[10px]">PortSec (max:{int.maxMac})</span>}
                        {int.blackholing && <span className="bg-red-950 text-red-400 border border-red-900 px-1.5 py-0.5 rounded text-[10px]">Blackhole</span>}
                      </td>
                      <td className="p-2 text-right pr-3">
                        <button
                          onClick={() => handleRemoveAccessInterface(idx)}
                          className="text-red-400 hover:text-red-300 text-[10px] font-mono bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 px-1.5 py-0.5 rounded cursor-pointer"
                        >
                          ✕ Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* TRUNK INTERFACES */}
        <div className="space-y-4 pt-4 border-t border-slate-800/60">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Interface Mode Trunk</h3>
          
          <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex gap-3 items-end max-w-xl">
              <div className="flex-1">
                <label className="block text-[11px] text-slate-400 mb-1">Trunk Interface Name</label>
                <input 
                  type="text" 
                  placeholder="ex: GigabitEthernet1/0" 
                  value={newTrunk.name}
                  onChange={(e) => setNewTrunk({...newTrunk, name: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200" 
                />
              </div>
              <button 
                onClick={handleAddTrunkInterface}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded px-4 py-1.5 text-xs font-medium transition cursor-pointer"
              >
                Add Trunk
              </button>
            </div>

            <div className="flex gap-6 pt-2 border-t border-slate-800/50">
              <label className="flex items-center space-x-2 text-xs cursor-pointer text-slate-300">
                <input 
                  type="checkbox" 
                  checked={newTrunk.dhcpTrust} 
                  onChange={(e) => setNewTrunk({...newTrunk, dhcpTrust: e.target.checked})} 
                  className="rounded bg-slate-900 border-slate-700 text-blue-500" 
                />
                <span>DHCP Snooping Trust</span>
              </label>
              <label className="flex items-center space-x-2 text-xs cursor-pointer text-slate-300">
                <input 
                  type="checkbox" 
                  checked={newTrunk.stormControl} 
                  onChange={(e) => setNewTrunk({...newTrunk, stormControl: e.target.checked})} 
                  className="rounded bg-slate-900 border-slate-700 text-blue-500" 
                />
                <span>Storm Control</span>
              </label>
            </div>

            {newTrunk.stormControl && (
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 grid grid-cols-3 gap-2 animate-fadeIn max-w-xl">
                <span className="col-span-3 text-[11px] font-mono text-cyan-400">⚡ Trunk Storm Control Levels (%) :</span>
                <div>
                  <label className="block text-[10px] text-slate-400">Unicast</label>
                  <input type="text" value={newTrunk.stormUnicast} onChange={(e) => setNewTrunk({...newTrunk, stormUnicast: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">Broadcast</label>
                  <input type="text" value={newTrunk.stormBroadcast} onChange={(e) => setNewTrunk({...newTrunk, stormBroadcast: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">Multicast</label>
                  <input type="text" value={newTrunk.stormMulticast} onChange={(e) => setNewTrunk({...newTrunk, stormMulticast: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
                </div>
              </div>
            )}

            {trunkError && <p className="text-xs text-red-400 font-mono">{trunkError}</p>}
          </div>
          
          {trunkInterfaces.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {trunkInterfaces.map((t, i) => (
                <span key={i} className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-md font-mono text-cyan-400 flex items-center gap-2">
                  <span>🔗 {t.name}</span>
                  {t.dhcpTrust && <span className="bg-blue-950 text-blue-400 border border-blue-900 px-1.5 py-0.2 rounded text-[9px]">DHCP Trust</span>}
                  {t.stormControl && <span className="bg-cyan-950 text-cyan-400 border border-cyan-900 px-1.5 py-0.2 rounded text-[9px]">Storm ({t.stormBroadcast}%)</span>}
                  <button
                    onClick={() => handleRemoveTrunkInterface(i)}
                    className="text-red-400 hover:text-red-300 text-[10px] ml-1 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 px-1 py-0.2 rounded cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SVI MANAGEMENT */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-sm font-mono uppercase tracking-wider text-blue-400 mb-4 border-b border-slate-800 pb-2">🌐 SVI Management Interface</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Management IP</label>
            <input type="text" placeholder="192.168.1.10" value={mgmtIp} onChange={(e) => setMgmtIp(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Management Mask</label>
            <input type="text" placeholder="255.255.255.0" value={mgmtMask} onChange={(e) => setMgmtMask(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Management VLAN ID</label>
            <input type="number" placeholder="750" value={mgmtVlan} onChange={(e) => setMgmtVlan(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Management Gateway</label>
            <input type="text" placeholder="192.168.1.1" value={mgmtGateway} onChange={(e) => setMgmtGateway(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <p className="text-[10px] text-slate-500 font-mono mt-3">💡 Note : L'IP et la passerelle doivent correspondre au meme sous-reseau IP.</p>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <label className="flex items-center space-x-3 cursor-pointer select-none">
          <input 
            type="checkbox" 
            checked={saveAfterChange}
            onChange={(e) => setSaveAfterChange(e.target.checked)}
            className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0 h-4 w-4" 
          />
          <span className="text-sm font-medium text-slate-300">💾 Execute <code className="bg-slate-950 px-1 py-0.5 rounded text-xs text-emerald-400 font-mono">write memory</code> after changes</span>
        </label>

        <button
          onClick={handleDeploy}
          disabled={isDeploying}
          className={`w-full sm:w-auto bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold px-8 py-3 rounded-lg text-sm transition-all shadow-lg cursor-pointer ${
            isDeploying ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {isDeploying ? "Lancement du Playbook..." : "Push Switch Playbook"}
        </button>
      </footer>
    </div>
  );
}