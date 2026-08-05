SET XACT_ABORT ON;
BEGIN TRANSACTION;

CREATE TABLE dbo.Documents (
  Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  UserId uniqueidentifier NOT NULL REFERENCES dbo.Users(Id),
  DocumentType varchar(30) NOT NULL CONSTRAINT CK_Documents_Type CHECK (DocumentType IN ('resume','cover_letter')),
  FileName nvarchar(260) NOT NULL,
  ContentType nvarchar(100) NOT NULL,
  BlobName nvarchar(500) NOT NULL,
  SizeBytes bigint NOT NULL,
  IsPrimary bit NOT NULL DEFAULT 0,
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_Documents_UserType ON dbo.Documents (UserId, DocumentType, IsPrimary DESC, CreatedAt DESC);
INSERT dbo.SchemaMigrations (Version) VALUES ('005_resume_documents');
COMMIT;
