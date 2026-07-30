const mockApiFetch = jest.fn();
const mockReadJsonOrThrow = jest.fn();

jest.mock('../../../lib/apiClient', () => ({
  API_BASE_URL: 'https://api.example.test',
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  readJsonOrThrow: (...args: unknown[]) => mockReadJsonOrThrow(...args),
}));

jest.mock('../../../lib/authToken', () => ({
  getAuthToken: () => 'test-token',
}));

import { checkNearby } from './social.api';

describe('person reminder nearby polling', () => {
  it('bypasses HTTP caches on every geofence evaluation request', async () => {
    const response = { ok: true, status: 200 };
    mockApiFetch.mockResolvedValue(response);
    mockReadJsonOrThrow.mockResolvedValue([]);

    await expect(checkNearby()).resolves.toEqual([]);

    expect(mockApiFetch).toHaveBeenCalledWith('/person-reminders/nearby', {
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer test-token',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        Pragma: 'no-cache',
      },
    });
    expect(mockReadJsonOrThrow).toHaveBeenCalledWith(
      response,
      'https://api.example.test/person-reminders/nearby',
    );
  });
});
