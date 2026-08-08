-- Seed Stripe school catalog with common UC + Davis matches used by Greenhouse forms.
-- Live harvest expands this list; seed avoids cold-start empty cache.
IF NOT EXISTS (
  SELECT 1 FROM dbo.EmployerOptionCatalogs WHERE Board = N'stripe' AND FieldKind = N'school'
)
BEGIN
  INSERT dbo.EmployerOptionCatalogs (Board, FieldKind, OptionsJson)
  VALUES (
    N'stripe',
    N'school',
    N'["Davis and Elkins College","Davis College","University of California - Berkeley","University of California - Davis","University of California - Irvine","University of California - Los Angeles","University of California - Merced","University of California - Riverside","University of California - San Diego","University of California - Santa Barbara","University of California - Santa Cruz","University of Washington","Stanford University","Harvard University","Massachusetts Institute of Technology","Yale University","Princeton University","Columbia University","Cornell University","University of Michigan","Carnegie Mellon University","Georgia Institute of Technology","University of Texas at Austin","University of Illinois at Urbana-Champaign","Purdue University","University of Wisconsin - Madison"]'
  );
END
GO

INSERT dbo.SchemaMigrations (Version) VALUES ('014_seed_stripe_school_catalog');
GO
