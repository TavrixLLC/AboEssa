import { enhanceCodec, CodecInput } from './enhancement-codec';
process.once('message', (input: CodecInput) => {
  void enhanceCodec(input).then(
    (value) => {
      process.send?.({ value }, () => process.exit(0));
    },
    (error: unknown) => {
      process.send?.({ error: error instanceof Error ? error.message : 'IMAGE_CODEC_FAILED' }, () =>
        process.exit(1),
      );
    },
  );
});
