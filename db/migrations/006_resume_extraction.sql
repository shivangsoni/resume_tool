SET XACT_ABORT ON;
BEGIN TRANSACTION;

ALTER TABLE dbo.Documents ADD
  ExtractionStatus varchar(30) NOT NULL CONSTRAINT DF_Documents_ExtractionStatus DEFAULT 'not_requested',
  ExtractionJson nvarchar(max) NULL,
  ExtractedAt datetime2 NULL;
GO

ALTER TABLE dbo.Documents ADD CONSTRAINT CK_Documents_ExtractionStatus
  CHECK (ExtractionStatus IN ('not_requested','succeeded','failed'));
ALTER TABLE dbo.Documents ADD CONSTRAINT CK_Documents_ExtractionJson
  CHECK (ExtractionJson IS NULL OR ISJSON(ExtractionJson) = 1);

INSERT dbo.SchemaMigrations (Version) VALUES ('006_resume_extraction');
COMMIT;
