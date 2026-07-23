// src/utils/validators.ts

export const isValidIPv4 = (ip: string): boolean => {
  if (!ip) return false;
  const regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return regex.test(ip.trim());
};

export const isValidNetmask = (mask: string): boolean => {
  if (!mask) return false;
  const validMasks = [
    "255.255.255.255", "255.255.255.254", "255.255.255.252", "255.255.255.248",
    "255.255.255.240", "255.255.255.224", "255.255.255.192", "255.255.255.128",
    "255.255.255.0",   // <-- AJOUTÉ ICI (/24)
    "255.255.254.0",   // (/23)
    "255.255.252.0",   // (/22)
    "255.255.248.0",   // (/21)
    "255.255.240.0",   // (/20)
    "255.255.224.0",   // (/19)
    "255.255.192.0",   // (/18)
    "255.255.128.0",   // (/17)
    "255.255.0.0",     // (/16)
    "255.240.0.0",     // (/12)
    "255.0.0.0",       // (/8)
    "0.0.0.0"
  ];
  return validMasks.includes(mask.trim());
};

export const normalizeWildcard = (input: string): string => {
  if (!input) return "0.0.0.255";
  const trimmed = input.trim();
  if (isValidNetmask(trimmed)) {
    return trimmed.split('.').map(octet => 255 - parseInt(octet, 10)).join('.');
  }
  return trimmed;
};

export const isValidTimezone = (tz: string): boolean => {
  if (!tz) return false;
  const validZones = ["EST", "EDT", "CST", "CDT", "MST", "MDT", "PST", "PDT", "UTC", "GMT"];
  return validZones.includes(tz.trim().toUpperCase());
};

export const CISCO_INT_REGEX = /^(GigabitEthernet|TenGigabitEthernet|FastEthernet|Ethernet|Loopback|Vlan)\d+(\/\d+)*(\.\d+)?$/i;

export const validateInterfaceName = (name: string): { valid: boolean; warning?: string } => {
  if (!name.trim()) return { valid: false, warning: "Le nom d'interface est requis." };
  
  if (!CISCO_INT_REGEX.test(name.trim())) {
    return { 
      valid: true, 
      warning: "Nom d'interface non standard. Utilisez le nom canonique Cisco (ex: GigabitEthernet0/1, Vlan10, Loopback0)." 
    };
  }
  return { valid: true };
};