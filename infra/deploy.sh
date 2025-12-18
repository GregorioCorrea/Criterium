#!/usr/bin/env bash
set -euo pipefail

: "${AZ_SUBSCRIPTION_ID:?AZ_SUBSCRIPTION_ID no seteado}"
: "${AZ_LOCATION:=eastus2}"
: "${AZ_RG_NAME:=rg-criterium-node-mvp}"
: "${APP_NAME:=criterium-node-mvp-api}"
: "${SQL_SERVER:=criteriumnodesqlsrv}"
: "${SQL_DB:=criteriumdb}"
: "${SQL_ADMIN_USER:=sqladmin}"
: "${SQL_ADMIN_PASSWORD:=ChangeThis_Passw0rd!}"

echo "[+] Usando suscripción: $AZ_SUBSCRIPTION_ID"
az account set --subscription "$AZ_SUBSCRIPTION_ID"

echo "[+] Creando resource group..."
az group create -n "$AZ_RG_NAME" -l "$AZ_LOCATION" >/dev/null

echo "[+] Creando App Service Plan (Linux)..."
az appservice plan create -g "$AZ_RG_NAME" -n "plan-criterium-node" --sku B1 --is-linux >/dev/null

echo "[+] Creando Web App (Node)..."
az webapp create -g "$AZ_RG_NAME" -p "plan-criterium-node" -n "$APP_NAME" --runtime "NODE|20-lts" >/dev/null

echo "[+] Creando Application Insights..."
APPINS="${APP_NAME}-appi"
az monitor app-insights component create -g "$AZ_RG_NAME" -a "$APPINS" -l "$AZ_LOCATION" >/dev/null

echo "[+] Creando SQL Server + DB..."
az sql server create -g "$AZ_RG_NAME" -n "$SQL_SERVER" -u "$SQL_ADMIN_USER" -p "$SQL_ADMIN_PASSWORD" >/dev/null
az sql db create -g "$AZ_RG_NAME" -s "$SQL_SERVER" -n "$SQL_DB" --service-objective S2 >/dev/null

echo "[+] Habilitando acceso desde servicios Azure al SQL..."
az sql server firewall-rule create -g "$AZ_RG_NAME" -s "$SQL_SERVER" -n "AllowAzure" --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 >/dev/null

echo "[+] Configurando App Settings del Web App..."
CONN_STR="Server=tcp:${SQL_SERVER}.database.windows.net,1433;Initial Catalog=${SQL_DB};Persist Security Info=False;User ID=${SQL_ADMIN_USER};Password=${SQL_ADMIN_PASSWORD};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"

APPINS_CONN=$(az monitor app-insights component show -g "$AZ_RG_NAME" -a "$APPINS" --query connectionString -o tsv)

az webapp config appsettings set -g "$AZ_RG_NAME" -n "$APP_NAME" --settings   NODE_ENV=production   APPINSIGHTS_CONNECTION_STRING="$APPINS_CONN"   SQL_CONNECTION_STRING="$CONN_STR"   >/dev/null

echo "[✓] Infraestructura base creada. Falta desplegar el código del folder api/."
