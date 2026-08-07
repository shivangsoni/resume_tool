SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.UserCredentials', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserCredentials (
    UserId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.Users(Id),
    Username nvarchar(64) NOT NULL,
    PasswordHash nvarchar(500) NOT NULL,
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE UNIQUE INDEX IX_UserCredentials_Username ON dbo.UserCredentials (Username);
END

COMMIT;
