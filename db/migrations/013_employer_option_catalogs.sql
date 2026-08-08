-- Shared Greenhouse/employer select option catalogs (e.g. school lists).
IF OBJECT_ID(N'dbo.EmployerOptionCatalogs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.EmployerOptionCatalogs (
    Board NVARCHAR(100) NOT NULL,
    FieldKind NVARCHAR(100) NOT NULL,
    OptionsJson NVARCHAR(MAX) NOT NULL,
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_EmployerOptionCatalogs_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_EmployerOptionCatalogs PRIMARY KEY (Board, FieldKind)
  );
END
GO

INSERT dbo.SchemaMigrations (Version) VALUES ('013_employer_option_catalogs');
GO
