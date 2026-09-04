import { BadRequestException } from '@nestjs/common';
import { type ValidationError } from 'class-validator';

import { LoginDto } from './dto/login.dto';

const loginValidationMessages = {
  email: 'Please enter a valid email address',
  password: 'Password must contain at least 6 characters',
  rememberMe: 'Remember me must be a boolean value',
  unexpectedFields: 'Please remove unexpected fields from the request',
} as const;

function isLoginDtoError(error: ValidationError): boolean {
  return error.target instanceof LoginDto;
}

function flattenValidationMessages(errors: ValidationError[]): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }

    if (error.children?.length) {
      messages.push(...flattenValidationMessages(error.children));
    }
  }

  return messages;
}

function getLoginValidationMessage(errors: ValidationError[]): string | null {
  for (const error of errors) {
    if (!isLoginDtoError(error)) {
      continue;
    }

    if (error.constraints?.whitelistValidation) {
      return loginValidationMessages.unexpectedFields;
    }

    if (error.property === 'email') {
      if (error.constraints?.isNotEmpty) {
        return 'Email is required';
      }

      return loginValidationMessages.email;
    }

    if (error.property === 'password') {
      if (error.constraints?.isNotEmpty) {
        return 'Password is required';
      }

      return loginValidationMessages.password;
    }

    if (error.property === 'rememberMe') {
      return loginValidationMessages.rememberMe;
    }
  }

  return null;
}

export function createLoginValidationExceptionFactory() {
  return (errors: ValidationError[]) => {
    const loginMessage = getLoginValidationMessage(errors);

    if (loginMessage) {
      return new BadRequestException(loginMessage);
    }

    return new BadRequestException(flattenValidationMessages(errors));
  };
}
