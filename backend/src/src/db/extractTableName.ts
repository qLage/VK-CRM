// Helper function to extract table name from SQL query
function extractTableName(query: string): string | null {
  const insertMatch = query.match(/INSERT\s+INTO\s+(\w+)/i);
  if (insertMatch) return insertMatch[1];

  const updateMatch = query.match(/UPDATE\s+(\w+)/i);
  if (updateMatch) return updateMatch[1];

  const deleteMatch = query.match(/DELETE\s+FROM\s+(\w+)/i);
  if (deleteMatch) return deleteMatch[1];

  return null;
}

export default extractTableName;
