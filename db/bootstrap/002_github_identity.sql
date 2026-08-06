IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'applypilot-github-deploy')
  CREATE USER [applypilot-github-deploy] FROM EXTERNAL PROVIDER
    WITH OBJECT_ID='9aefdfda-7d9c-42fc-a6fd-2ba4a3d153d9';
GO

IF IS_ROLEMEMBER('db_ddladmin', 'applypilot-github-deploy') <> 1
  ALTER ROLE db_ddladmin ADD MEMBER [applypilot-github-deploy];

IF IS_ROLEMEMBER('db_datareader', 'applypilot-github-deploy') <> 1
  ALTER ROLE db_datareader ADD MEMBER [applypilot-github-deploy];

IF IS_ROLEMEMBER('db_datawriter', 'applypilot-github-deploy') <> 1
  ALTER ROLE db_datawriter ADD MEMBER [applypilot-github-deploy];

-- Required to create or repair runtime contained Entra users and grant only
-- their application-level data permissions. Fixed-role membership changes
-- require db_owner and are deliberately not delegated to CI.
GRANT ALTER ANY USER TO [applypilot-github-deploy];
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE TO [applypilot-github-deploy] WITH GRANT OPTION;
REVOKE ALTER ANY ROLE FROM [applypilot-github-deploy];
GO
