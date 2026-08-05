SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

CREATE OR ALTER PROCEDURE dbo.SyncJobs
  @JobsJson nvarchar(max)
AS
BEGIN
  SET NOCOUNT ON;
  IF ISJSON(@JobsJson) <> 1 THROW 50001, 'JobsJson must be valid JSON.', 1;

  MERGE dbo.Jobs WITH (HOLDLOCK) AS target
  USING (
    SELECT source.Id AS SourceId, parsed.ExternalId, parsed.Company, parsed.Title, parsed.Location,
           parsed.Description, parsed.Salary, parsed.SourceUrl, parsed.PostedAt
    FROM OPENJSON(@JobsJson) WITH (
      SourceName nvarchar(80) '$.source', ExternalId nvarchar(200) '$.externalId',
      Company nvarchar(250) '$.company', Title nvarchar(300) '$.title', Location nvarchar(300) '$.location',
      Description nvarchar(max) '$.description', Salary nvarchar(200) '$.salary',
      SourceUrl nvarchar(2000) '$.sourceUrl', PostedAt datetime2 '$.postedAt'
    ) parsed
    INNER JOIN dbo.JobSources source ON source.Name = parsed.SourceName
  ) AS incoming
  ON target.SourceId = incoming.SourceId AND target.ExternalId = incoming.ExternalId
  WHEN MATCHED THEN UPDATE SET Company=incoming.Company, Title=incoming.Title, Location=incoming.Location,
    Description=incoming.Description, Salary=incoming.Salary, SourceUrl=incoming.SourceUrl,
    PostedAt=incoming.PostedAt, LastSeenAt=SYSUTCDATETIME(), IsActive=1
  WHEN NOT MATCHED THEN INSERT (SourceId, ExternalId, Company, Title, Location, Description, Salary, SourceUrl, PostedAt)
    VALUES (incoming.SourceId, incoming.ExternalId,
      incoming.Company, incoming.Title, incoming.Location, incoming.Description, incoming.Salary, incoming.SourceUrl, incoming.PostedAt);

  UPDATE dbo.JobSources SET LastSuccessfulSyncAt=SYSUTCDATETIME()
  WHERE Name IN (SELECT DISTINCT SourceName FROM OPENJSON(@JobsJson) WITH (SourceName nvarchar(80) '$.source'));
END;
GO

INSERT dbo.SchemaMigrations (Version) VALUES ('003_job_sync_procedure');
COMMIT;
GO
