export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StoredObject {
  key: string;
  url: string;
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
}

