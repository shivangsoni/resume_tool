SET XACT_ABORT ON;
BEGIN TRANSACTION;

ALTER TABLE dbo.InboundMessages
  ADD ApplicationId uniqueidentifier NULL
    REFERENCES dbo.Applications(Id);

CREATE INDEX IX_InboundMessages_Application
  ON dbo.InboundMessages (ApplicationId)
  WHERE ApplicationId IS NOT NULL;

INSERT dbo.SchemaMigrations (Version) VALUES ('011_mailbox_application_links');
COMMIT;
