import assert from 'node:assert/strict';
import test from 'node:test';
import { commentTargetDecision } from './commentTarget.ts';

const base = { loading: false, loadingMore: false, hasMore: false };
test('scrolls to an already loaded comment', () => assert.deepEqual(commentTargetDecision({ ...base, targetId: 'c2', comments: [{ id: 'c1' }, { id: 'c2' }] }), { type: 'scroll', index: 1 }));
test('waits for delayed pages by requesting more content', () => assert.deepEqual(commentTargetDecision({ ...base, hasMore: true, targetId: 'c9', comments: [{ id: 'c1' }] }), { type: 'load-more' }));
test('reports a deleted comment after all content is loaded', () => assert.deepEqual(commentTargetDecision({ ...base, targetId: 'gone', comments: [{ id: 'c1' }] }), { type: 'missing' }));
test('does not scroll twice for the same target', () => assert.deepEqual(commentTargetDecision({ ...base, handledTarget: 'c2', targetId: 'c2', comments: [{ id: 'c2' }] }), { type: 'none' }));
test('a changed target gets a new scroll decision', () => assert.deepEqual(commentTargetDecision({ ...base, handledTarget: 'c1', targetId: 'c2', comments: [{ id: 'c1' }, { id: 'c2' }] }), { type: 'scroll', index: 1 }));
