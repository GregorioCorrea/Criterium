# Criterium OKR – MVP (Node.js + TypeScript)
Fecha: 2025-12-23

Seed de proyecto para el MVP de Criterium OKR usando Node.js + Express + TypeScript, listo para correr en Azure App Service con Azure SQL.

## Objetivo Fase 1
- API REST básica con Node + Express + TypeScript.
- CRUD mínimo de OKRs/KRs (en memoria primero, luego Azure SQL).
- Estructura de proyecto limpia: domain, services, routes, infra.
- Infraestructura base para App Service + SQL + App Insights.
- Manifest base para app de Teams (tab personal).

## Estructura
infra/               # scripts de despliegue (Azure CLI) y .env.example
api/                 # código fuente Node/TypeScript (Express)
db/                  # esquema SQL
teams/               # manifest base para Teams
devops/              # pipeline YAML para Azure DevOps

## Requisitos previos
- Node.js 20.x
- npm o yarn
- Azure CLI
- Cuenta de Azure + App Service + SQL (o permisos para crearlos)
- Tenant de Microsoft 365 para pruebas con Teams

## Quickstart local

cd api
npm install
npm run dev

La API arranca en http://localhost:3000 con:

- GET /health
- GET /okrs
- POST /okrs
- GET /krs
- POST /krs

## Deploy a Azure (MVP)

cd infra
cp .env.example .env   # completar variables
# en Linux/Mac:
export $(grep -v '^#' .env | xargs)
# en PowerShell tendrás que exportar a mano las variables

bash deploy.sh

Luego configurás el Web App para que use Node 20 y desplegás el contenido de api/ (vía Azure DevOps o ZIP deploy).

## Notas
- Inicialmente el almacenamiento es en memoria. El siguiente paso es conectar Azure SQL usando el schema.sql.
- Autenticación con Entra ID y Graph se agregan en la siguiente iteración.

## Pilot hardening (enero 2026)
- Mensajes de error unificados en messagebox y toasts para acciones exitosas.
- Empty states claros para board, OKR sin KRs y KR sin check-ins.
- Logs estructurados de acciones (okr/kr/checkin/members/alignment) y denegaciones authz.
- Timeouts y fallback seguro para Azure OpenAI y Microsoft Graph.
- Deletes con transaccion (OKR/KR) para evitar datos huerfanos.
- Validaciones defensivas (check-ins negativos no permitidos segun unidad; fecha futura bloqueada si se envia).
