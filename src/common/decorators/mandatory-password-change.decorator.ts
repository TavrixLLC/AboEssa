import { SetMetadata } from '@nestjs/common';

export const ALLOW_MANDATORY_PASSWORD_CHANGE = 'allowMandatoryPasswordChange';
export const AllowMandatoryPasswordChange = () => SetMetadata(ALLOW_MANDATORY_PASSWORD_CHANGE, true);
