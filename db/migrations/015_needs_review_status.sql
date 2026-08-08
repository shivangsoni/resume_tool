SET XACT_ABORT ON;
BEGIN TRANSACTION;

ALTER TABLE dbo.Applications DROP CONSTRAINT CK_Applications_Status;
ALTER TABLE dbo.Applications ADD CONSTRAINT CK_Applications_Status
  CHECK (Status IN (
    'draft',
    'review',
    'queued',
    'processing',
    'needs_action',
    'needs_review',
    'submitted',
    'interview',
    'offer',
    'rejected',
    'failed'
  ));

INSERT dbo.SchemaMigrations (Version) VALUES ('015_needs_review_status');
COMMIT;
