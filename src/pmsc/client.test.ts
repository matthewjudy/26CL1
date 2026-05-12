import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PmscClient } from './client.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('PmscClient', () => {
  let client: PmscClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new PmscClient('https://pmsc.test', 'test-token', 'user-1');
  });

  it('fetchGoals returns parsed goals', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'g1', title: 'SEM Leads 2026', progress: 0.45 }],
    });

    const goals = await client.fetchGoals();
    expect(goals).toHaveLength(1);
    expect(goals[0].title).toBe('SEM Leads 2026');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://pmsc.test/api/goals',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    );
  });

  it('submitIntake POSTs payload and returns id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'intake-123' }),
    });

    const result = await client.submitIntake({ jobName: 'lsvr', data: { leads: 100 }, goalId: 'g1' });
    expect(result.id).toBe('intake-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://pmsc.test/api/intake',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
    await expect(client.fetchGoals()).rejects.toThrow('PMSC 401');
  });
});
