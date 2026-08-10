jest.mock('../../lib/apiClient', () => ({ API_BASE_URL: 'http://api', apiFetch: jest.fn() }));
jest.mock('../../lib/authToken', () => ({ getAuthToken: () => 'token' }));
import { apiFetch } from '../../lib/apiClient';
import { updateCapsuleDraft } from './api';
describe('Time Capsule mobile API', () => {
  it('PATCHes an existing draft instead of creating another capsule', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'draft-1' }) });
    await updateCapsuleDraft('draft-1', { title: 'Saved' });
    expect(apiFetch).toHaveBeenCalledWith('/time-capsules/draft-1', expect.objectContaining({ method: 'PATCH' }));
  });
});
