import { ConfigService } from '@nestjs/config';
import { SmartLocationInferenceService } from './smart-location-inference.service';

describe('SmartLocationInferenceService', () => {
  const service = new SmartLocationInferenceService({
    get: () => undefined,
  } as unknown as ConfigService);

  it.each([
    ['Buy medicine', 'pharmacy'],
    ['Buy groceries', 'supermarket'],
    ['Get coffee', 'cafe'],
    ['Withdraw cash', 'atm'],
    ['Fill the car with fuel', 'gas_station'],
    ['Buy laptop charger', 'electronics_store'],
  ])('falls back to rules for "%s"', (text, category) => {
    expect(service.inferWithRules(text)).toMatchObject({
      category,
      source: 'rules',
    });
  });

  it('returns no category when rules do not find a place intent', () => {
    expect(service.inferWithRules('Review notes at home')).toMatchObject({
      category: null,
      confidence: 0,
      source: 'rules',
    });
  });
});
