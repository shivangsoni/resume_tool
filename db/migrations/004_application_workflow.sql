SET XACT_ABORT ON;
BEGIN TRANSACTION;

ALTER TABLE dbo.Applications ADD
  JobExternalId nvarchar(200) NULL,
  Company nvarchar(250) NULL,
  Title nvarchar(300) NULL,
  Location nvarchar(300) NULL,
  Source nvarchar(80) NULL,
  SourceUrl nvarchar(2000) NULL,
  AnswersJson nvarchar(max) NULL,
  Notes nvarchar(2000) NULL,
  SubmittedConfirmedAt datetime2 NULL;
GO

ALTER TABLE dbo.Applications ADD CONSTRAINT CK_Applications_AnswersJson
  CHECK (AnswersJson IS NULL OR ISJSON(AnswersJson) = 1);

CREATE INDEX IX_Applications_UserUpdated ON dbo.Applications (UserId, UpdatedAt DESC)
  INCLUDE (Company, Title, Status, SourceUrl);

INSERT dbo.SchemaMigrations (Version) VALUES ('004_application_workflow');
COMMIT;
