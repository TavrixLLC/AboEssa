import { LabelStatus, SaleSource } from '@prisma/client';

export type LabelPayload = {
  storeName: string;
  customerName: string;
  customerPhone?: string;
  customerCode: string;
  itemBarcode: string;
  price: number;
  currency: string;
  categoryName?: string;
  source: SaleSource;
  soldAt: string;
  flags: {
    isBroken: boolean;
    isGift: boolean;
    isReplacement: boolean;
  };
  labelStatus: LabelStatus;
  qrValue: string;
  barcodeValue: string;
};

