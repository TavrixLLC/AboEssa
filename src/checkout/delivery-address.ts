import { HttpStatus } from '@nestjs/common';
import { CheckoutDeliveryDto } from 'src/checkout/dto/checkout.dto';
import { AppException } from 'src/common/exceptions/app.exception';
import { normalizePhone } from 'src/common/utils/phone.util';

export function deliveryAddress(value: CheckoutDeliveryDto) {
  const phone = normalizePhone(value.phone);
  if (!/^\+?[0-9]{10,15}$/.test(phone)) {
    throw new AppException(
      'Invalid delivery phone',
      'INVALID_DELIVERY_PHONE',
      HttpStatus.BAD_REQUEST,
    );
  }
  const address = {
    fullName: value.fullName.trim(),
    phone,
    governorate: value.governorate.trim(),
    city: value.city.trim(),
    addressLine: value.addressLine.trim(),
    nearestPoint: value.nearestPoint?.trim() || null,
  };
  if (!address.fullName || !address.governorate || !address.city || !address.addressLine) {
    throw new AppException(
      'Delivery address is required',
      'DELIVERY_ADDRESS_REQUIRED',
      HttpStatus.BAD_REQUEST,
    );
  }
  return address;
}

export function hasDeliveryAddress(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const address = value as Record<string, unknown>;
  try {
    if (
      !['fullName', 'phone', 'governorate', 'city', 'addressLine'].every(
        (key) => typeof address[key] === 'string',
      )
    )
      return false;
    deliveryAddress(address as unknown as CheckoutDeliveryDto);
    return true;
  } catch {
    return false;
  }
}
