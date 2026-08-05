SET XACT_ABORT ON;
BEGIN TRANSACTION;

CREATE TABLE dbo.Mailboxes (
  Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  UserId uniqueidentifier NOT NULL UNIQUE REFERENCES dbo.Users(Id),
  Alias varchar(64) NOT NULL UNIQUE,
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.InboundMessages (
  Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  MailboxId uniqueidentifier NOT NULL REFERENCES dbo.Mailboxes(Id),
  ProviderMessageId nvarchar(255) NOT NULL UNIQUE,
  SenderName nvarchar(200) NULL,
  SenderEmail nvarchar(320) NOT NULL,
  Subject nvarchar(500) NOT NULL,
  TextBody nvarchar(max) NULL,
  ReceivedAt datetime2 NOT NULL,
  IsRead bit NOT NULL DEFAULT 0,
  AttachmentCount int NOT NULL DEFAULT 0,
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_InboundMessages_MailboxReceived
  ON dbo.InboundMessages (MailboxId, ReceivedAt DESC);

INSERT dbo.SchemaMigrations (Version) VALUES ('007_inbound_mailbox');
COMMIT;
