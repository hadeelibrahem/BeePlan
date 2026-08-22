import { parseJsonResponse } from '../ai/utils/json-response';

export type AnalysisOutput = { likelyCause: string; evidence: string[]; investigationSteps: string[]; suggestedFix: string; likelyModules: string[]; confidence: 'low' | 'medium' | 'high'; limitations: string[] };
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const safeString = (value: unknown) => typeof value === 'string' ? value.trim() : null;

/** Strict contract with only harmless formatting normalization (fences, whitespace, confidence case). */
export function parseAnalysisResponse(raw: string): AnalysisOutput | null {
  let value: unknown;
  try { value = parseJsonResponse(raw); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const likelyCause = safeString(data.likelyCause); const suggestedFix = safeString(data.suggestedFix);
  const confidence = safeString(data.confidence)?.toLowerCase();
  if (!likelyCause || !suggestedFix || !strings(data.evidence) || !strings(data.investigationSteps) || !strings(data.likelyModules) || !strings(data.limitations) || !['low', 'medium', 'high'].includes(confidence ?? '')) return null;
  return { likelyCause, suggestedFix, evidence: data.evidence.map((item) => item.trim()), investigationSteps: data.investigationSteps.map((item) => item.trim()), likelyModules: data.likelyModules.map((item) => item.trim()), limitations: data.limitations.map((item) => item.trim()), confidence: confidence as AnalysisOutput['confidence'] };
}

/** Safe development diagnostic: names/types/length only, never model content. */
export function responseShape(raw: string | null) { if (raw === null) return { kind: 'null' }; try { const value = parseJsonResponse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: Array.isArray(value) ? 'array' : typeof value, length: raw.length }; const data = value as Record<string, unknown>; return { kind: 'object', length: raw.length, fields: Object.fromEntries(Object.entries(data).map(([key, item]) => [key, Array.isArray(item) ? `array(${item.length})` : typeof item])) }; } catch { return { kind: 'invalid_json', length: raw.length, fenced: /^```/m.test(raw) }; } }
