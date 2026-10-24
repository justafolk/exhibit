// Keep fixture metadata intact while presenting concise workspace names.
export const displayLabel = (value: string) =>
  value.replace(/^Sample(?: metadata)?:\s*/, '');
