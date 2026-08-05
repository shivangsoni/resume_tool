SET XACT_ABORT ON;
BEGIN TRANSACTION;

CREATE TABLE dbo.SchemaMigrations (
  Version varchar(50) NOT NULL PRIMARY KEY,
  AppliedAt datetime2 NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedAt DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Users (
  Id uniqueidentifier NOT NULL CONSTRAINT PK_Users PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  ExternalSubject nvarchar(200) NOT NULL UNIQUE,
  Email nvarchar(320) NULL,
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.CandidateProfiles (
  UserId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.Users(Id),
  ProfileJson nvarchar(max) NOT NULL CONSTRAINT CK_CandidateProfiles_Json CHECK (ISJSON(ProfileJson) = 1),
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Applications (
  Id uniqueidentifier NOT NULL CONSTRAINT PK_Applications PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  UserId uniqueidentifier NOT NULL REFERENCES dbo.Users(Id),
  JobId bigint NOT NULL,
  Status varchar(30) NOT NULL CONSTRAINT CK_Applications_Status CHECK (Status IN ('draft','review','submitted','interview','offer','rejected','failed')),
  AppliedAt datetime2 NULL,
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_Applications_UserJob UNIQUE (UserId, JobId)
);

INSERT dbo.SchemaMigrations (Version) VALUES ('001_initial');
COMMIT;
