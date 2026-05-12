import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphEmailClient } from './graph-client.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

let client: GraphEmailClient;

describe('GraphEmailClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    client = new GraphEmailClient({
      tenantId: 't1',
      clientId: 'c1',
      clientSecret: 's1',
      userEmail: 'test@example.com',
    });
  });

  it('getAccessToken fetches and caches token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok123', expires_in: 3600 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: [] }),
    });

    await client.getInboxSince(new Date());
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('oauth2/v2.0/token'),
      expect.anything(),
    );
  });

  it('getInboxSince returns emails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          { id: 'e1', subject: 'Test', from: { emailAddress: { address: 'a@b.com' } }, bodyPreview: 'Hello', receivedDateTime: '2026-05-11T08:00:00Z', isRead: false },
        ],
      }),
    });

    const emails = await client.getInboxSince(new Date('2026-05-11T07:00:00Z'));
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe('Test');
  });

  it('saveDraft calls the drafts endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'draft-1' }) });

    const id = await client.saveDraft({ subject: 'Re: Test', body: 'Sure thing.', to: 'a@b.com' });
    expect(id).toBe('draft-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
