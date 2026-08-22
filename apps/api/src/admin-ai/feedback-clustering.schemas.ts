import { parseJsonResponse } from '../ai/utils/json-response';

export type FeedbackClusterOutput = { clusters: Array<{ title: string; summary: string; feedbackIds: string[]; confidence: 'low' | 'medium' | 'high' }>; unclusteredFeedbackIds: string[] };
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** Parses only bounded, structurally-valid AI grouping output; membership is validated against the requested batch separately. */
export function parseFeedbackClusterResponse(raw: string): FeedbackClusterOutput | null {
  let value: unknown; try { value = parseJsonResponse(raw); } catch { return null; }
  if (!value || typeof value !== 'object') return null; const data = value as Record<string, unknown>;
  if (!Array.isArray(data.clusters) || !Array.isArray(data.unclusteredFeedbackIds) || !data.unclusteredFeedbackIds.every((id) => typeof id === 'string')) return null;
  const clusters = [] as FeedbackClusterOutput['clusters']; const memberIds = new Set<string>();
  for (const candidate of data.clusters) { if (!candidate || typeof candidate !== 'object') return null; const item = candidate as Record<string, unknown>; const title = clean(item.title); const summary = clean(item.summary); const confidence = clean(item.confidence).toLowerCase(); const feedbackIds = item.feedbackIds; if (!title || title.length > 160 || !summary || summary.length > 1000 || !Array.isArray(feedbackIds) || feedbackIds.length < 2 || !feedbackIds.every((id) => typeof id === 'string') || !['low','medium','high'].includes(confidence)) return null; for (const id of feedbackIds) { if (memberIds.has(id)) return null; memberIds.add(id); } clusters.push({ title, summary, feedbackIds, confidence: confidence as 'low' | 'medium' | 'high' }); }
  return { clusters, unclusteredFeedbackIds: data.unclusteredFeedbackIds };
}

export function validateFeedbackClusterMembership(output: FeedbackClusterOutput, suppliedIds: readonly string[]) { const allowed = new Set(suppliedIds); return output.clusters.every((cluster) => cluster.feedbackIds.every((id) => allowed.has(id))) && output.unclusteredFeedbackIds.every((id) => allowed.has(id)); }

const primitiveType = (value: unknown) => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
const fields = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value as Record<string, unknown>).sort() : [];
const harmlessConfidence = (value: unknown) => typeof value === 'string' && ['low', 'medium', 'high'].includes(value.toLowerCase()) ? value : undefined;

/** Development-only structural diagnostics. It deliberately exposes no model-generated text or IDs. */
export function feedbackClusterValidationShape(raw: string, suppliedIds: readonly string[] = []) {
  let value: unknown;
  try { value = parseJsonResponse(raw); } catch { return { category: 'invalid_json', responseLength: raw.length }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { category: 'top_level', expected: 'object', actualType: primitiveType(value), responseLength: raw.length };
  const data = value as Record<string, unknown>; const base = { topLevelFields: fields(data), clusterCount: Array.isArray(data.clusters) ? data.clusters.length : null, unclusteredMembershipCount: Array.isArray(data.unclusteredFeedbackIds) ? data.unclusteredFeedbackIds.length : null };
  if (!Array.isArray(data.clusters)) return { ...base, category: 'field', path: 'clusters', expected: 'array', actualType: primitiveType(data.clusters) };
  if (!Array.isArray(data.unclusteredFeedbackIds) || !data.unclusteredFeedbackIds.every((id) => typeof id === 'string')) return { ...base, category: 'field', path: 'unclusteredFeedbackIds', expected: 'string[]', actualType: primitiveType(data.unclusteredFeedbackIds), arrayLength: Array.isArray(data.unclusteredFeedbackIds) ? data.unclusteredFeedbackIds.length : null };
  const seen = new Set<string>(); let duplicateMembership = false; let fewerThanTwoMembers = false; let unknownFeedbackId = false; const allowed = new Set(suppliedIds);
  for (let index = 0; index < data.clusters.length; index++) { const candidate = data.clusters[index]; const path = `clusters[${index}]`; if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { ...base, category: 'cluster', path, expected: 'object', actualType: primitiveType(candidate) }; const item = candidate as Record<string, unknown>; const clusterFields = fields(item); const title = clean(item.title), summary = clean(item.summary), confidence = clean(item.confidence).toLowerCase(), ids = item.feedbackIds;
    if (!title || title.length > 160) return { ...base, category: 'field', path: `${path}.title`, expected: 'non-empty string up to 160 chars', actualType: primitiveType(item.title), clusterFields };
    if (!summary || summary.length > 1000) return { ...base, category: 'field', path: `${path}.summary`, expected: 'non-empty string up to 1000 chars', actualType: primitiveType(item.summary), clusterFields };
    if (!['low','medium','high'].includes(confidence)) return { ...base, category: 'field', path: `${path}.confidence`, expected: 'low | medium | high (case-insensitive)', actualType: primitiveType(item.confidence), confidence: harmlessConfidence(item.confidence), clusterFields };
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string') || ids.length < 2) return { ...base, category: 'field', path: `${path}.feedbackIds`, expected: 'string[] with at least 2 members', actualType: primitiveType(ids), arrayLength: Array.isArray(ids) ? ids.length : null, clusterFields, fewerThanTwoMembers: Array.isArray(ids) && ids.length < 2 };
    for (const id of ids) { if (seen.has(id)) duplicateMembership = true; seen.add(id); if (allowed.size && !allowed.has(id)) unknownFeedbackId = true; }
  }
  for (const id of data.unclusteredFeedbackIds as string[]) if (allowed.size && !allowed.has(id)) unknownFeedbackId = true;
  return { ...base, category: duplicateMembership ? 'duplicate_membership' : unknownFeedbackId ? 'unknown_feedback_id' : 'schema_valid', duplicateMembership, unknownFeedbackId, fewerThanTwoMembers, membershipCount: seen.size, perClusterFields: data.clusters.map(fields) };
}
