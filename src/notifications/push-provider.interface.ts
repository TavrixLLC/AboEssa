export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export type PushSendResult =
  | { status: 'SENT' }
  | { status: 'INVALID_TOKEN'; code: string }
  | { status: 'PERMANENT_FAILURE'; code: string };

export interface PushProvider {
  readonly enabled: boolean;
  send(input: {
    token: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }): Promise<PushSendResult>;
}
