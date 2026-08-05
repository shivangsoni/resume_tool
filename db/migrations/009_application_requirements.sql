SET XACT_ABORT ON;
BEGIN TRANSACTION;

ALTER TABLE dbo.Applications ADD RequiredQuestionsJson nvarchar(max) NULL;
ALTER TABLE dbo.Applications ADD CONSTRAINT CK_Applications_RequiredQuestionsJson
  CHECK (RequiredQuestionsJson IS NULL OR ISJSON(RequiredQuestionsJson) = 1);

INSERT dbo.SchemaMigrations (Version) VALUES ('009_application_requirements');
COMMIT;
