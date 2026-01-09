IF OBJECT_ID('dbo.OkrMembers', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.OkrMembers (
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    okr_id UNIQUEIDENTIFIER NOT NULL,
    user_object_id UNIQUEIDENTIFIER NOT NULL,
    role NVARCHAR(16) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    created_by UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_OkrMembers PRIMARY KEY (tenant_id, okr_id, user_object_id),
    CONSTRAINT FK_OkrMembers_Okr FOREIGN KEY (okr_id)
      REFERENCES dbo.okrs (id) ON DELETE CASCADE
  );

  CREATE INDEX IX_OkrMembers_Tenant_User
    ON dbo.OkrMembers (tenant_id, user_object_id);

  CREATE INDEX IX_OkrMembers_Tenant_Okr
    ON dbo.OkrMembers (tenant_id, okr_id);
END
