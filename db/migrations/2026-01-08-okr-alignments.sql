IF OBJECT_ID('dbo.OkrAlignments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.OkrAlignments (
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    parent_okr_id UNIQUEIDENTIFIER NOT NULL,
    child_okr_id UNIQUEIDENTIFIER NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_OkrAlignments PRIMARY KEY (tenant_id, parent_okr_id, child_okr_id),
    CONSTRAINT FK_OkrAlignments_Parent FOREIGN KEY (parent_okr_id)
      REFERENCES dbo.okrs (id),
    CONSTRAINT FK_OkrAlignments_Child FOREIGN KEY (child_okr_id)
      REFERENCES dbo.okrs (id)
  );

  CREATE INDEX IX_OkrAlignments_Tenant_Parent
    ON dbo.OkrAlignments (tenant_id, parent_okr_id);

  CREATE INDEX IX_OkrAlignments_Tenant_Child
    ON dbo.OkrAlignments (tenant_id, child_okr_id);
END
