<#
  azure-setup.ps1 — Crea/configura el Web App de ControlUsuarios en Azure App Service.

  NO contiene secretos: los lee de .env.local (gitignored) al momento de correr.
  Reutiliza los valores que ya te funcionan en local (DB AdelanteSBX, JWT, etc.),
  con overrides para el entorno desplegado:
    - NODE_ENV=production
    - ENABLE_DEV_LOGIN=true   (deja andar el dev-login; QUITAR para producción real)

  Lo corres VOS con tu login de Azure (Claude no toca Azure). Es idempotente.

  Uso:
    az login
    az account set --subscription "azureadelantedesarrollos"
    ./scripts/azure-setup.ps1

  Requisitos: Azure CLI (az) instalado, .env.local en la raíz del repo.
#>

$ErrorActionPreference = "Stop"

# --- Recursos ---
$ResourceGroup = "rg-controlusuarios"
$Location      = "southcentralus"   # co-localizado con el SQL mysqladelante (southcentralus)
$PlanName      = "plan-controlusuarios"
$WebAppName    = "usuarios-ad"            # -> usuarios-ad.azurewebsites.net (debe ser único)
$Sku           = "B1"
$Runtime       = "NODE:22-lts"
$AppUrl        = "https://$WebAppName.azurewebsites.net"

# ============================================================================
#  Cargar .env.local (clave=valor) — de ahí salen los secretos
# ============================================================================
$envPath = Join-Path $PSScriptRoot "..\.env.local"
if (-not (Test-Path $envPath)) { throw ".env.local no encontrado en la raíz del repo ($envPath)" }

$envVars = @{}
foreach ($line in Get-Content $envPath) {
  $t = $line.Trim()
  if (-not $t -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
  $i = $t.IndexOf('=')
  $k = $t.Substring(0, $i).Trim()
  $v = $t.Substring($i + 1).Trim()
  if ($v.Length -ge 2 -and (($v[0] -eq '"' -and $v[-1] -eq '"') -or ($v[0] -eq "'" -and $v[-1] -eq "'"))) {
    $v = $v.Substring(1, $v.Length - 2)
  }
  $envVars[$k] = $v
}
function Req($name) {
  if (-not $envVars.ContainsKey($name) -or -not $envVars[$name]) { throw "Falta $name en .env.local" }
  return $envVars[$name]
}
function Has($name) { return ($envVars.ContainsKey($name) -and $envVars[$name]) }
function Opt($name, $default) { if (Has $name) { return $envVars[$name] } else { return $default } }

Write-Host "==> Usando base de datos: $(Req 'DB_NAME') en $(Req 'DB_SERVER')" -ForegroundColor Cyan

# ============================================================================
#  1. Resource group + App Service Plan (Linux) + Web App (Node 22)
# ============================================================================
Write-Host "==> Resource group $ResourceGroup ($Location)" -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location | Out-Null

Write-Host "==> App Service Plan $PlanName (Linux $Sku)" -ForegroundColor Cyan
az appservice plan create `
  --name $PlanName --resource-group $ResourceGroup `
  --location $Location --is-linux --sku $Sku | Out-Null

Write-Host "==> Web App $WebAppName ($Runtime)" -ForegroundColor Cyan
az webapp create `
  --name $WebAppName --resource-group $ResourceGroup `
  --plan $PlanName --runtime $Runtime | Out-Null

# Arranque del server standalone de Next.
Write-Host "==> Startup command: node server.js" -ForegroundColor Cyan
az webapp config set `
  --name $WebAppName --resource-group $ResourceGroup `
  --startup-file "node server.js" | Out-Null

# SCM basic auth: necesario para que el deploy por publish profile (GitHub Actions)
# funcione. Los web apps nuevos lo traen DESHABILITADO por defecto -> el workflow
# falla con "Publish profile is invalid for app-name". Habilitarlo lo arregla.
Write-Host "==> Habilitar SCM basic auth (para deploy por publish profile)" -ForegroundColor Cyan
az resource update --resource-group $ResourceGroup --name scm `
  --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies `
  --parent "sites/$WebAppName" --set properties.allow=true | Out-Null

# ============================================================================
#  2. App Settings (variables de entorno)
# ============================================================================
Write-Host "==> App settings" -ForegroundColor Cyan

$settings = [System.Collections.ArrayList]@(
  @{ name = "WEBSITES_PORT";                  value = "8080" }
  @{ name = "PORT";                           value = "8080" }
  # Next standalone enlaza a process.env.HOSTNAME; sin esto bindea a un host no
  # ruteable en App Service y la probe de warmup falla (503 / ContainerTimeout).
  @{ name = "HOSTNAME";                       value = "0.0.0.0" }
  @{ name = "NODE_ENV";                       value = "production" }
  @{ name = "SCM_DO_BUILD_DURING_DEPLOYMENT"; value = "false" }
  @{ name = "NEXT_PUBLIC_APP_URL";            value = $AppUrl }
  @{ name = "DB_SERVER";                      value = (Req "DB_SERVER") }
  @{ name = "DB_NAME";                        value = (Req "DB_NAME") }
  @{ name = "DB_USER";                        value = (Req "DB_USER") }
  @{ name = "DB_PASSWORD";                    value = (Req "DB_PASSWORD") }
  @{ name = "DB_PORT";                        value = (Opt "DB_PORT" "1433") }
  @{ name = "JWT_SECRET";                     value = (Req "JWT_SECRET") }
  # ⚠️ Para PRODUCCIÓN real: quitar ENABLE_DEV_LOGIN (deja entrar sin contraseña).
  @{ name = "ENABLE_DEV_LOGIN";               value = "true" }
)

# Opcionales: solo se agregan si están en .env.local (OTP real, Business Central, telemetría)
foreach ($k in @("TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_PHONE_NUMBER",
                 "BC_TENANT_ID","BC_CLIENT_ID","BC_CLIENT_SECRET","BC_ENVIRONMENT","BC_COMPANY_ID",
                 "APPLICATIONINSIGHTS_CONNECTION_STRING")) {
  if (Has $k) { [void]$settings.Add(@{ name = $k; value = $envVars[$k] }) }
}

$tmp = [System.IO.Path]::GetTempFileName()
try {
  $json = ConvertTo-Json -InputObject @($settings) -Depth 3
  [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding($false)))
  az webapp config appsettings set `
    --name $WebAppName --resource-group $ResourceGroup `
    --settings "@$tmp" | Out-Null
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue   # borra el temp con secretos
}

# ============================================================================
#  3. Firewall de SQL: permitir las IP outbound del Web App
# ============================================================================
Write-Host "==> IPs outbound del Web App (agregalas al firewall del SQL server)" -ForegroundColor Cyan
$outbound = az webapp show --name $WebAppName --resource-group $ResourceGroup `
  --query "outboundIpAddresses" -o tsv
Write-Host "    $outbound" -ForegroundColor Yellow
Write-Host "    -> En el SQL server (mysqladelante) > Networking > Firewall rules, agregá esas IPs," -ForegroundColor Yellow
Write-Host "       o activá 'Allow Azure services and resources to access this server'." -ForegroundColor Yellow

# ============================================================================
#  4. Publish profile para GitHub Actions
# ============================================================================
Write-Host "==> Publish profile (subir como secret AZURE_WEBAPP_PUBLISH_PROFILE en GitHub)" -ForegroundColor Cyan
$profilePath = Join-Path $PSScriptRoot "..\publish-profile.xml"
az webapp deployment list-publishing-profiles `
  --name $WebAppName --resource-group $ResourceGroup --xml | Out-File -Encoding utf8 $profilePath
Write-Host "    Guardado en $profilePath" -ForegroundColor Yellow
Write-Host "    GitHub repo > Settings > Secrets and variables > Actions > New secret:" -ForegroundColor Yellow
Write-Host "    Name = AZURE_WEBAPP_PUBLISH_PROFILE  | Value = el contenido COMPLETO de ese archivo." -ForegroundColor Yellow
Write-Host "    ⚠️ Borrá publish-profile.xml después de copiarlo (ya está en .gitignore)." -ForegroundColor Red

Write-Host "`n==> Listo. Recurso: $AppUrl" -ForegroundColor Green
