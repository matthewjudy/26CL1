const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  bodyPreview: string;
  receivedDateTime: string;
  isRead: boolean;
}

export interface DraftInput {
  subject: string;
  body: string;
  to: string;
  replyToId?: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class GraphEmailClient {
  private tokenCache: TokenCache | null = null;

  constructor(private readonly creds: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    userEmail: string;
  }) {}

  async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const { tenantId, clientId, clientSecret } = this.creds;
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });

    if (!res.ok) throw new Error(`Graph auth failed: ${await res.text()}`);
    const data = await res.json() as { access_token: string; expires_in: number };
    this.tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return data.access_token;
  }

  private async graphGet<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Graph GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async graphPost<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Graph POST ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getInboxSince(since: Date): Promise<EmailMessage[]> {
    const filter = encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`);
    const select = 'id,subject,from,bodyPreview,receivedDateTime,isRead';
    const data = await this.graphGet<{ value: any[] }>(
      `/users/${this.creds.userEmail}/mailFolders/inbox/messages?$filter=${filter}&$select=${select}&$orderby=receivedDateTime%20desc&$top=50`,
    );
    return data.value.map((m) => ({
      id: m.id,
      subject: m.subject ?? '(no subject)',
      from: m.from?.emailAddress?.address ?? 'unknown',
      bodyPreview: m.bodyPreview ?? '',
      receivedDateTime: m.receivedDateTime,
      isRead: m.isRead,
    }));
  }

  async getSentSince(since: Date): Promise<EmailMessage[]> {
    const filter = encodeURIComponent(`sentDateTime ge ${since.toISOString()}`);
    const select = 'id,subject,toRecipients,bodyPreview,sentDateTime';
    const data = await this.graphGet<{ value: any[] }>(
      `/users/${this.creds.userEmail}/mailFolders/sentItems/messages?$filter=${filter}&$select=${select}&$orderby=sentDateTime%20desc&$top=20`,
    );
    return data.value.map((m) => ({
      id: m.id,
      subject: m.subject ?? '(no subject)',
      from: this.creds.userEmail,
      bodyPreview: m.bodyPreview ?? '',
      receivedDateTime: m.sentDateTime,
      isRead: true,
    }));
  }

  async saveDraft(draft: DraftInput): Promise<string> {
    // TODO: wire draft.replyToId into reply thread linkage when needed
    const body = {
      subject: draft.subject,
      body: { contentType: 'Text', content: draft.body },
      toRecipients: [{ emailAddress: { address: draft.to } }],
    };
    const result = await this.graphPost<{ id: string }>(
      `/users/${this.creds.userEmail}/messages`,
      body,
    );
    return result.id;
  }
}
