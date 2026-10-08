$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:4173'

function New-LoginSession([string]$identifier) {
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -WebSession $session -ContentType 'application/json' -Body (@{ identifier = $identifier; password = 'Aureum123!' } | ConvertTo-Json) | Out-Null
  return $session
}

function Get-StatusCode([scriptblock]$Action) {
  try { & $Action | Out-Null; return 200 } catch { return $_.Exception.Response.StatusCode.value__ }
}

$admin = New-LoginSession 'admin@aureum.com'
$manager = New-LoginSession 'manager@aureum.com'
$agent = New-LoginSession 'advisor@aureum.com'

$settings = (Invoke-RestMethod -Uri "$base/api/settings" -WebSession $admin).data
$settingsStatus = (Invoke-RestMethod -Uri "$base/api/settings/lead-statuses" -WebSession $admin).data
$notifications = Invoke-RestMethod -Uri "$base/api/notifications" -WebSession $admin
$agentSearch = Invoke-RestMethod -Uri "$base/api/search?q=Ahmed" -WebSession $agent
$managerSettingsCode = Get-StatusCode { Invoke-RestMethod -Uri "$base/api/settings" -WebSession $manager }
$agentSettingsCode = Get-StatusCode { Invoke-RestMethod -Uri "$base/api/settings" -WebSession $agent }
$agentReportsCode = Get-StatusCode { Invoke-RestMethod -Uri "$base/api/reports/summary" -WebSession $agent }

if ($settings.company.crm_name -ne 'Aureum Sales CRM') { throw 'Settings API did not return the expected CRM name.' }
if ($settingsStatus.Count -lt 10) { throw 'Lead status seed data is incomplete.' }
if ($managerSettingsCode -ne 403 -or $agentSettingsCode -ne 403 -or $agentReportsCode -ne 403) { throw 'Role hardening smoke test failed.' }
if ($agentSearch.data.leads.Count -lt 1 -or $agentSearch.data.agents.Count -ne 0) { throw 'Role-filtered global search smoke test failed.' }

[pscustomobject]@{
  settings = 'ok'
  seededStatuses = $settingsStatus.Count
  adminUnread = $notifications.unread
  agentSearchLeads = $agentSearch.data.leads.Count
  managerSettings = $managerSettingsCode
  agentSettings = $agentSettingsCode
  agentReports = $agentReportsCode
} | ConvertTo-Json -Compress
