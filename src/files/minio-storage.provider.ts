import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { AppException } from 'src/common/exceptions/app.exception';
import {
  RetrievedObject,
  StorageProvider,
  StoredObject,
} from 'src/files/storage-provider.interface';

type MinioError = Error & { code?: string };

@Injectable()
export class MinioStorageProvider implements StorageProvider, OnModuleInit {
  private readonly client: Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('storage.minio.bucket') ?? 'aboessa-media';
    this.client = new Client({
      endPoint: config.get<string>('storage.minio.endpoint') ?? 'localhost',
      port: config.get<number>('storage.minio.port') ?? 9000,
      useSSL: config.get<boolean>('storage.minio.useSsl') ?? false,
      accessKey: config.get<string>('storage.minio.accessKey') ?? 'minioadmin',
      secretKey: config.get<string>('storage.minio.secretKey') ?? 'minioadmin',
    });
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
  }

  async putObject(input: {
    key: string;
    body: Buffer;
    mimeType: string;
    size: number;
  }): Promise<StoredObject> {
    await this.client.putObject(this.bucket, input.key, input.body, input.size, {
      'Content-Type': input.mimeType,
    });
    return {
      key: input.key,
      url: `/api/media/${input.key}`,
      mimeType: input.mimeType,
      size: input.size,
    };
  }

  async getObject(key: string): Promise<RetrievedObject> {
    try {
      const [stat, stream] = await Promise.all([
        this.client.statObject(this.bucket, key),
        this.client.getObject(this.bucket, key),
      ]);
      return {
        stream,
        mimeType: stat.metaData?.['content-type']?.toString() ?? 'application/octet-stream',
        size: stat.size,
      };
    } catch (error) {
      const code = (error as MinioError).code;
      if (code === 'NoSuchKey' || code === 'NoSuchObject') {
        throw new AppException('Media was not found', 'MEDIA_NOT_FOUND', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async removeObject(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
