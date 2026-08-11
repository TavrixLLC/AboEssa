export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

export interface OtpProvider {
  sendOtp(phone: string, otp: string): Promise<void>;
}

