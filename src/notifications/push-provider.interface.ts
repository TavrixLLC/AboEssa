export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export interface PushProvider {
  send(input: {
    customerId: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
}
