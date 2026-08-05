SET XACT_ABORT ON;
BEGIN TRANSACTION;

CREATE TABLE dbo.JobSources (
  Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  Name nvarchar(80) NOT NULL UNIQUE,
  SourceType varchar(30) NOT NULL,
  ConfigurationJson nvarchar(max) NULL CONSTRAINT CK_JobSources_Json CHECK (ConfigurationJson IS NULL OR ISJSON(ConfigurationJson) = 1),
  IsEnabled bit NOT NULL DEFAULT 1,
  LastSuccessfulSyncAt datetime2 NULL
);

CREATE TABLE dbo.Jobs (
  Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  SourceId int NOT NULL REFERENCES dbo.JobSources(Id),
  ExternalId nvarchar(200) NOT NULL,
  Company nvarchar(250) NOT NULL,
  Title nvarchar(300) NOT NULL,
  Location nvarchar(300) NULL,
  Description nvarchar(max) NULL,
  Salary nvarchar(200) NULL,
  SourceUrl nvarchar(2000) NOT NULL,
  PostedAt datetime2 NULL,
  FirstSeenAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  LastSeenAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ExpiresAt datetime2 NULL,
  IsActive bit NOT NULL DEFAULT 1,
  ContentHash binary(32) NULL,
  CONSTRAINT UQ_Jobs_SourceExternal UNIQUE (SourceId, ExternalId)
);

CREATE INDEX IX_Jobs_ActivePostedAt ON dbo.Jobs (IsActive, PostedAt DESC) INCLUDE (Company, Title, Location);
CREATE INDEX IX_Jobs_CompanyTitle ON dbo.Jobs (Company, Title);
CREATE INDEX IX_Applications_UserStatus ON dbo.Applications (UserId, Status, UpdatedAt DESC);

INSERT dbo.JobSources (Name, SourceType) VALUES ('Greenhouse', 'ats'), ('Remotive', 'aggregator');
INSERT dbo.SchemaMigrations (Version) VALUES ('002_job_search');
COMMIT;
