SET XACT_ABORT ON;
BEGIN TRANSACTION;

ALTER TABLE dbo.Applications DROP CONSTRAINT CK_Applications_Status;
ALTER TABLE dbo.Applications ADD CONSTRAINT CK_Applications_Status
  CHECK (Status IN ('draft','review','queued','processing','needs_action','submitted','interview','offer','rejected','failed'));

ALTER TABLE dbo.Applications ADD
  SubmissionProvider nvarchar(100) NULL,
  ProviderReceiptId nvarchar(300) NULL,
  LastSubmissionError nvarchar(2000) NULL,
  SubmissionQueuedAt datetime2 NULL;

CREATE TABLE dbo.ApplicationSubmissionAttempts (
  Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ApplicationSubmissionAttempts PRIMARY KEY,
  ApplicationId uniqueidentifier NOT NULL REFERENCES dbo.Applications(Id),
  Outcome varchar(30) NOT NULL,
  Provider nvarchar(100) NULL,
  ProviderReceiptId nvarchar(300) NULL,
  Detail nvarchar(2000) NULL,
  CreatedAt datetime2 NOT NULL CONSTRAINT DF_ApplicationSubmissionAttempts_CreatedAt DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_ApplicationSubmissionAttempts_ApplicationCreated
  ON dbo.ApplicationSubmissionAttempts (ApplicationId, CreatedAt DESC);

INSERT dbo.SchemaMigrations (Version) VALUES ('008_submission_queue');
COMMIT;
