import { PassThrough, Readable } from 'node:stream';
import { normalizeMediaResponse } from 'src/files/media-reference.util';
import { MediaController } from 'src/files/media.controller';

describe('media response contract', () => {
  it('converts legacy localhost uploads to a device-resolvable relative path', () => {
    const response = normalizeMediaResponse({
      imageUrls: [
        'http://localhost:8080/uploads/products/legacy.jpg',
        'http://127.0.0.1:8080/uploads/products/legacy-2.png',
      ],
    });

    expect(response).toEqual({
      imageUrls: ['/uploads/products/legacy.jpg', '/uploads/products/legacy-2.png'],
    });
  });

  it('converts an internal MinIO object URL to the private API media route', () => {
    const response = normalizeMediaResponse({
      primaryImageUrl: 'http://minio:9000/aboessa-media/products/item.webp',
    });

    expect(response).toEqual({
      primaryImageUrl: '/api/media/products/item.webp',
    });
  });

  it('preserves safe external images and malformed values without throwing', () => {
    expect(
      normalizeMediaResponse({
        imageUrl: 'https://cdn.example.test/catalog/item.jpg',
        imageUrls: ['not a valid URL'],
      }),
    ).toEqual({
      imageUrl: 'https://cdn.example.test/catalog/item.jpg',
      imageUrls: ['not a valid URL'],
    });
  });

  it('normalizes upload DTO url without changing its object key', () => {
    expect(
      normalizeMediaResponse({
        url: 'http://localhost:8080/uploads/products/item.jpg',
        key: 'products/item.jpg',
        mimeType: 'image/jpeg',
        size: 42,
      }),
    ).toEqual({
      url: '/uploads/products/item.jpg',
      key: 'products/item.jpg',
      mimeType: 'image/jpeg',
      size: 42,
    });
  });

  it('serves private storage bytes with the authoritative content type', async () => {
    const storage = {
      getObject: jest.fn().mockResolvedValue({
        stream: Readable.from(Buffer.from([1, 2, 3])),
        mimeType: 'image/webp',
        size: 3,
      }),
    };
    const response = new PassThrough() as PassThrough & {
      status: jest.Mock;
      setHeader: jest.Mock;
    };
    response.status = jest.fn().mockReturnValue(response);
    response.setHeader = jest.fn();

    await new MediaController(storage as any).getMedia('products', 'item.webp', response as any);

    expect(storage.getObject).toHaveBeenCalledWith('products/item.webp');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '3');
  });
});
