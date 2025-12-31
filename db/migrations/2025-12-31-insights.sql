IF OBJECT_ID('dbo.KrInsights', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KrInsights (
    id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    kr_id UNIQUEIDENTIFIER NOT NULL,
    risk NVARCHAR(20) NULL,
    explanation_short NVARCHAR(280) NOT NULL,
    explanation_long NVARCHAR(MAX) NOT NULL,
    suggestion NVARCHAR(280) NOT NULL,
    computed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    source NVARCHAR(20) NOT NULL,
    version INT NOT NULL
  );

  CREATE UNIQUE INDEX UX_KrInsights_Tenant_Kr
    ON dbo.KrInsights (tenant_id, kr_id);
END

IF OBJECT_ID('dbo.OkrInsights', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.OkrInsights (
    id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    okr_id UNIQUEIDENTIFIER NOT NULL,
    explanation_short NVARCHAR(280) NOT NULL,
    explanation_long NVARCHAR(MAX) NOT NULL,
    suggestion NVARCHAR(280) NOT NULL,
    computed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    source NVARCHAR(20) NOT NULL,
    version INT NOT NULL
  );

  CREATE UNIQUE INDEX UX_OkrInsights_Tenant_Okr
    ON dbo.OkrInsights (tenant_id, okr_id);
END
