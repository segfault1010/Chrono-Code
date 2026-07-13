-- Add INSERT and UPDATE policies for repository_comparisons to allow the backend to save data using the anon key

CREATE POLICY "Allow anon insert on repository_comparisons"
  ON repository_comparisons
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anon update on repository_comparisons"
  ON repository_comparisons
  FOR UPDATE
  USING (true);
