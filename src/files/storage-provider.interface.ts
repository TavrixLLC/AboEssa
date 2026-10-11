import { Readable } from 'node:stream';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StoredObject {
  key: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface RetrievedObject {
  stream: Readable;
  mimeType: string;
  size: number;
}

export interface StorageProvider {
  putObject(input: {
    key: string;
    body: Buffer;
    mimeType: string;
    size: number;
  }): Promise<StoredObject>;

  getObject(key: string): Promise<RetrievedObject>;

  removeObject(key: string): Promise<void>;
}
