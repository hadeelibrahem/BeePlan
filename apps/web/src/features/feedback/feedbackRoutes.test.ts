import { describe, expect, it } from 'vitest'
import { resolveAppRoute } from '../../lib/appRoutes'

describe('feedback routes', () => {
  it('resolves a public feedback detail route', () => {
    expect(resolveAppRoute('/feedback/idea-1')).toMatchObject({ screen: 'feedback', feedbackId: 'idea-1' })
  })
})
