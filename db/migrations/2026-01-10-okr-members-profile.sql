IF COL_LENGTH('dbo.OkrMembers', 'display_name') IS NULL
BEGIN
  ALTER TABLE dbo.OkrMembers
    ADD display_name NVARCHAR(200) NULL;
END

IF COL_LENGTH('dbo.OkrMembers', 'email') IS NULL
BEGIN
  ALTER TABLE dbo.OkrMembers
    ADD email NVARCHAR(320) NULL;
END
