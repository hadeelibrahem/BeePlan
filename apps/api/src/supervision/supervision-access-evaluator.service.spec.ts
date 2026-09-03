import { SupervisionAccessEvaluator } from './supervision-access-evaluator.service'

describe('SupervisionAccessEvaluator', () => {
  it('rejects unstructured provider output instead of treating it as authorization', async () => {
    const evaluator = new SupervisionAccessEvaluator({ get: (key: string) => key === 'QWEN_API_KEY' ? 'key' : key === 'QWEN_BASE_URL' ? 'https://example.invalid/v1' : 'model' } as never)
    ;(evaluator as any).client = { chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"decision":"allow"}' } }] }) } } }
    await expect(evaluator.evaluate({ justification: 'I need the lecture linked to today\'s assignment.', packageName: 'com.video', recentRequestCount: 0 })).rejects.toThrow('Access analysis is temporarily unavailable.')
  })
})
