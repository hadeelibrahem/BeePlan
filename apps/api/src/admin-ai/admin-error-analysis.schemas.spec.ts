import { parseAnalysisResponse } from './admin-error-analysis.schemas';
const valid = { likelyCause: 'Provider timeout', evidence: ['status 500'], investigationSteps: ['Check provider status'], suggestedFix: 'Retry with backoff', likelyModules: ['notifications'], confidence: 'high', limitations: [] };
describe('Admin AI analysis response parsing', () => {
  it('accepts plain JSON', () => expect(parseAnalysisResponse(JSON.stringify(valid))).toEqual(valid));
  it('accepts fenced JSON and harmless confidence casing', () => expect(parseAnalysisResponse(`\`\`\`json\n${JSON.stringify({ ...valid, confidence: 'High' })}\n\`\`\``)?.confidence).toBe('high'));
  it('rejects malformed JSON', () => expect(parseAnalysisResponse('{nope')).toBeNull());
  it('rejects a missing required field', () => { const { suggestedFix, ...missing } = valid; expect(parseAnalysisResponse(JSON.stringify(missing))).toBeNull(); });
  it('rejects invalid confidence', () => expect(parseAnalysisResponse(JSON.stringify({ ...valid, confidence: 'certain' }))).toBeNull());
  it('does not coerce prose arrays into a successful analysis', () => expect(parseAnalysisResponse(JSON.stringify({ ...valid, evidence: 'status 500' }))).toBeNull());
});
