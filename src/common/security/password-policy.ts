import { AppException } from 'src/common/exceptions/app.exception';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const assertPasswordPolicy = (password: string, currentPassword?: string) => {
  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/\S/.test(password)
  ) {
    throw new AppException(
      `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters and contain a letter and a number`,
      'PASSWORD_TOO_WEAK',
    );
  }
  if (currentPassword !== undefined && password === currentPassword) {
    throw new AppException('New password must differ from the current password', 'PASSWORD_REUSE_NOT_ALLOWED');
  }
};
