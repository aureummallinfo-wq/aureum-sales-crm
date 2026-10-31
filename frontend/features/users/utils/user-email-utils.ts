export function deriveAureumEmail(fullName: string, domain = "aureum.com"): string {
  const firstName = String(fullName || "").trim().split(/\s+/)[0] || "";
  const localPart = firstName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const host = String(domain || "aureum.com").trim().toLowerCase();
  return localPart && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `${localPart}@${host}` : "";
}

export function buildAccessEmailPreview(user: { fullName: string; email: string }, temporaryPassword: string): string { return `Your Aureum Sales CRM access for ${user.fullName} (${user.email}) is ready. Temporary password: ${temporaryPassword}`; }
