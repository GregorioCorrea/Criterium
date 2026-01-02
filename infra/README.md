# Azure OpenAI (Managed Identity)

Variables requeridas en App Service:

- AZURE_OPENAI_ENDPOINT
- AZURE_OPENAI_DEPLOYMENT
- AZURE_OPENAI_API_VERSION
- INSIGHTS_AI_ENABLED

El App Service debe tener identidad administrada asignada con el rol
`Cognitive Services OpenAI User` sobre el recurso Azure OpenAI.
