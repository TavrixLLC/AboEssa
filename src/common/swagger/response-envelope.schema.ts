import { Type } from '@nestjs/common';
import { getSchemaPath } from '@nestjs/swagger';

export const successEnvelopeSchema = (model: Type<unknown> | [Type<unknown>]) => {
  const isArray = Array.isArray(model);
  const target = isArray ? model[0] : model;
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: isArray ? { type: 'array', items: { $ref: getSchemaPath(target) } } : { $ref: getSchemaPath(target) },
    },
  };
};

export const unitSuccessEnvelopeSchema = () => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      example: { read: true },
    },
  },
});

