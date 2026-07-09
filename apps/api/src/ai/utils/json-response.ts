export function stripJsonCodeFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

export function parseJsonResponse(raw: string): unknown {
  return JSON.parse(stripJsonCodeFence(raw));
}
