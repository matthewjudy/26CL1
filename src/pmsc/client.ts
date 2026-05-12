import type { Goal, Initiative, Task, IntakePayload, IntakeResult } from './types.js';

export class PmscClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly userId: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PMSC ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  async fetchGoals(): Promise<Goal[]> {
    return this.request<Goal[]>('/goals');
  }

  async fetchInitiatives(): Promise<Initiative[]> {
    return this.request<Initiative[]>('/initiatives');
  }

  async fetchTasks(): Promise<Task[]> {
    return this.request<Task[]>(`/tasks?assignee=${encodeURIComponent(this.userId)}`);
  }

  async submitIntake(payload: IntakePayload): Promise<IntakeResult> {
    return this.request<IntakeResult>('/intake', {
      method: 'POST',
      body: JSON.stringify({ ...payload, runAt: payload.runAt ?? new Date().toISOString() }),
    });
  }
}
