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
GO
