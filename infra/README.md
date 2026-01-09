# Azure OpenAI (Managed Identity)

Variables requeridas en App Service:

- AZURE_OPENAI_ENDPOINT
- AZURE_OPENAI_DEPLOYMENT
- AZURE_OPENAI_API_VERSION
- INSIGHTS_AI_ENABLED

# Microsoft Graph (resolver de usuarios por email)

Variables requeridas en App Service:

- GRAPH_CLIENT_ID
- GRAPH_CLIENT_SECRET
- GRAPH_TENANT_ID (opcional; si no se define, se usa el tid del request)

Notas:
- La app usa client-credentials contra Microsoft Graph.
- El resolver busca por mail o userPrincipalName en el tenant indicado.

El App Service debe tener identidad administrada asignada con el rol
`Cognitive Services OpenAI User` sobre el recurso Azure OpenAI.
