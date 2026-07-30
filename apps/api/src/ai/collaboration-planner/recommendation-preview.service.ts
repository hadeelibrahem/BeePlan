import { BadRequestException, Injectable } from '@nestjs/common';
import { TaskAccessService } from '../../collaboration/task-access.service';
import { AiRecommendationsService } from './ai-recommendations.service';
import type { DetailedRecommendation } from './recommendation-detail.logic';
import { buildPreview, type RecommendationPreview } from './recommendation-preview.logic';

export type RecommendationPreviewResponse = RecommendationPreview & {
  recommendation: DetailedRecommendation;
};

/**
 * "What happens if I approve this?" — answered WITHOUT mutating anything.
 *
 * This service performs NO simulation of its own. It reads the one
 * RecommendationSimulationService already produced for the card the user
 * clicked, so the before/after shown here is the same computation that decided
 * the card was valid and that will be re-checked on approve. Calculating a
 * second, independent preview here is exactly the inconsistency this phase
 * exists to make impossible.
 *
 * Read-only for any accepted viewer+: viewers may inspect a preview, they just
 * cannot act on it (approve/dismiss still require editor+).
 */
@Injectable()
export class RecommendationPreviewService {
  constructor(
    private readonly access: TaskAccessService,
    private readonly recommendations: AiRecommendationsService,
  ) {}

  async preview(
    userId: string,
    taskId: string,
    recommendationId: string,
  ): Promise<RecommendationPreviewResponse> {
    const { role } = await this.access.require(userId, taskId, 'viewer');
    const { detail, changes, simulation } = await this.recommendations.loadForDecision(
      taskId,
      recommendationId,
      role,
    );

    if (detail.status !== 'pending') {
      throw new BadRequestException(
        detail.resolutionLabel
          ? `This recommendation was already resolved — ${detail.resolutionLabel.toLowerCase()}.`
          : 'This recommendation was already resolved.',
      );
    }
    if (!changes.length) {
      throw new BadRequestException(
        'This recommendation can no longer be applied — the work it referred to has changed.',
      );
    }

    const simulated = simulation.byRecommendation.get(recommendationId);
    if (!simulated) {
      throw new BadRequestException(
        'The effect of this recommendation could not be measured against the current plan.',
      );
    }

    const preview = buildPreview({
      before: simulation.baseline,
      after: simulated.projected,
      generatedAt: simulation.generatedAt,
    });
    return { ...preview, recommendation: detail };
  }
}
