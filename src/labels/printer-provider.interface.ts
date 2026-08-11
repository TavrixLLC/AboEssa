export const LABEL_PRINTER_PROVIDER = Symbol('LABEL_PRINTER_PROVIDER');

export interface LabelPrinterProvider {
  print(input: { printerName?: string; payload: Record<string, unknown> }): Promise<void>;
}

