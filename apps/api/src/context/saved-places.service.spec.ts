import { DatabaseService } from '../db/database.service';
import { SavedPlacesService } from './saved-places.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

// Chainable thenable mirroring drizzle's query builder for reads.
function selectQuery(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    leftJoin: () => builder,
    limit: () => builder,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return builder;
}

/** Each select() call dequeues the next result set. */
function buildService(datasets: unknown[][]) {
  let call = 0;
  const db = {
    select: jest.fn(() => selectQuery(datasets[call++] ?? [])),
  };
  return new SavedPlacesService({ db } as unknown as DatabaseService);
}

function placeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    userId: USER_ID,
    name: 'Home',
    icon: '🏠',
    address: 'Tubas, Palestine',
    category: 'home',
    latitude: '32.3200000',
    longitude: '35.3690000',
    radiusMeters: 150,
    createdAt: new Date('2021-01-01T00:00:00.000Z'),
    updatedAt: new Date('2021-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function aliasRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    savedLocationId: 'p1',
    userId: USER_ID,
    alias: 'house',
    normalizedAlias: 'house',
    createdAt: new Date('2021-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('SavedPlacesService.resolvePlacesFromText', () => {
  it('resolves an English alias mention to its canonical place', async () => {
    // resolvePlacesFromText -> list() does two selects: places then aliases.
    const service = buildService([[placeRow()], [aliasRow()]]);
    const resolved = await service.resolvePlacesFromText(USER_ID, 'grab keys from the house before leaving');

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ id: 'p1', name: 'Home', category: 'home', latitude: 32.32 });
    expect(resolved[0].matchedAlias).toBe('house');
  });

  it('resolves an Arabic alias to the canonical place', async () => {
    const service = buildService([
      [placeRow()],
      [aliasRow({ alias: 'البيت', normalizedAlias: 'بيت' })],
    ]);
    const resolved = await service.resolvePlacesFromText(USER_ID, 'ذكرني اطفي الغاز في البيت');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].name).toBe('Home');
  });

  it('matches the canonical place name even without an explicit alias', async () => {
    const service = buildService([[placeRow({ name: 'University', category: 'university' })], []]);
    const resolved = await service.resolvePlacesFromText(USER_ID, 'submit the form at university tomorrow');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].name).toBe('University');
  });

  it('returns nothing when no place is mentioned', async () => {
    const service = buildService([[placeRow()], [aliasRow()]]);
    const resolved = await service.resolvePlacesFromText(USER_ID, 'call the dentist at noon');
    expect(resolved).toEqual([]);
  });

  it('returns nothing when the user has no saved places', async () => {
    const service = buildService([[]]);
    const resolved = await service.resolvePlacesFromText(USER_ID, 'anything at home');
    expect(resolved).toEqual([]);
  });
});
