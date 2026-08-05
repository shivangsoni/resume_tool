SET XACT_ABORT ON;
BEGIN TRANSACTION;

CREATE TABLE dbo.UserIdentities (
  ExternalSubject nvarchar(200) NOT NULL PRIMARY KEY,
  UserId uniqueidentifier NOT NULL REFERENCES dbo.Users(Id),
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);

SELECT u.Id SourceUserId,
       FIRST_VALUE(u.Id) OVER (
         PARTITION BY LOWER(COALESCE(u.Email, CONVERT(nvarchar(36), u.Id)))
         ORDER BY COALESCE(a.LatestApplication, '19000101') DESC,
                  COALESCE(d.LatestDocument, '19000101') DESC,
                  u.UpdatedAt DESC
       ) CanonicalUserId
INTO #UserMap
FROM dbo.Users u
OUTER APPLY (SELECT MAX(UpdatedAt) LatestApplication FROM dbo.Applications WHERE UserId=u.Id) a
OUTER APPLY (SELECT MAX(CreatedAt) LatestDocument FROM dbo.Documents WHERE UserId=u.Id) d;

INSERT dbo.UserIdentities (ExternalSubject, UserId)
SELECT u.ExternalSubject, m.CanonicalUserId FROM dbo.Users u JOIN #UserMap m ON m.SourceUserId=u.Id;

UPDATE d SET UserId=m.CanonicalUserId
FROM dbo.Documents d JOIN #UserMap m ON m.SourceUserId=d.UserId
WHERE d.UserId<>m.CanonicalUserId;

SELECT duplicate.Id DuplicateId, canonical.Id CanonicalId INTO #DuplicateApplications
FROM dbo.Applications duplicate
JOIN #UserMap m ON m.SourceUserId=duplicate.UserId AND duplicate.UserId<>m.CanonicalUserId
JOIN dbo.Applications canonical ON canonical.UserId=m.CanonicalUserId AND canonical.JobId=duplicate.JobId;

UPDATE attempts SET ApplicationId=duplicates.CanonicalId
FROM dbo.ApplicationSubmissionAttempts attempts JOIN #DuplicateApplications duplicates ON duplicates.DuplicateId=attempts.ApplicationId;
DELETE applications FROM dbo.Applications applications JOIN #DuplicateApplications duplicates ON duplicates.DuplicateId=applications.Id;
UPDATE applications SET UserId=m.CanonicalUserId
FROM dbo.Applications applications JOIN #UserMap m ON m.SourceUserId=applications.UserId
WHERE applications.UserId<>m.CanonicalUserId;

INSERT dbo.SchemaMigrations (Version) VALUES ('010_identity_aliases');
COMMIT;
