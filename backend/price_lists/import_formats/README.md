# Price-list import formats

The quality importer selects a format profile by `format_id`. To add a brand
profile:

1. Add a dedicated parser module; do not change the standard product-list
   importer.
2. Define the accepted `.xlsx` header aliases and required columns.
3. Validate the ZIP package, size, row and column limits before parsing.
4. Return detected columns, unit text, reconciliation counts, structured
   flags, and separate error, warning, and info summaries.
5. Bind preview data to the authenticated user and delete it after commit.
6. Add merged, flat, reordered, missing-column, hidden-data, malformed-file,
   authorization, and export formula-injection tests.
7. Add a management command preview and update the frontend preview panel.
