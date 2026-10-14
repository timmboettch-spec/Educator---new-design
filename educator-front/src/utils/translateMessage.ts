import loginEn from '../locales/auth/login/en.json';
import loginEs from '../locales/auth/login/es.json';

export type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

export const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

const enToEsMap: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const enToast = (loginEn as { toast?: Record<string, string> }).toast || {};
  const esToast = (loginEs as { toast?: Record<string, string> }).toast || {};

  Object.keys(enToast).forEach((key) => {
    const enVal = enToast[key];
    const esVal = esToast[key];
    if (enVal && esVal) {
      map[enVal.toLowerCase().trim()] = esVal;
    }
  });

  return map;
})();

export function translateApiMessage(
  message: string | number,
  lang?: SupportedLang
): string {
  const str = String(message).trim();
  if (!str) return str;

  const currentLang = lang || getStoredLanguage();
  if (currentLang !== 'es') {
    return str;
  }

  const normalized = str.toLowerCase();
  if (enToEsMap[normalized]) {
    return enToEsMap[normalized];
  }

  const esToast = (loginEs as { toast?: Record<string, string> }).toast || {};

  // Backend phrasing sometimes differs from the locale key's canonical English value.
  if (normalized.includes('class already exists in this school')) {
    return esToast.classNameAlreadyExists || 'El nombre de la clase ya existe';
  }
  if (normalized.includes('insufficient') && normalized.includes('seat')) {
    return esToast.insufficientSeats || 'Cupos insuficientes disponibles';
  }
  if (normalized.includes('insufficient') && normalized.includes('token')) {
    return esToast.insufficientTokens || 'Tokens insuficientes';
  }
  if (
    normalized.includes('login successful') ||
    normalized.includes('login succeeded')
  ) {
    return esToast.loginSuccess || 'Inicio de sesión exitoso';
  }
  if (normalized.includes('password reset successfully')) {
    return esToast.passwordResetSuccess || 'Contraseña restablecida con éxito';
  }
  if (normalized.includes('otp sent successfully')) {
    return (
      esToast.otpSentSuccess || 'OTP enviado con éxito a tu correo electrónico'
    );
  }
  if (normalized.includes('otp verified successfully')) {
    return esToast.otpVerifiedSuccess || 'OTP verificado con éxito';
  }
  if (
    normalized.includes('account created') ||
    normalized.includes('registered successfully')
  ) {
    return esToast.accountCreated || 'Cuenta creada con éxito';
  }
  if (normalized.includes('signed out successfully')) {
    return esToast.logoutSuccess || '¡Sesión cerrada con éxito!';
  }
  if (
    normalized.includes('no changes applied') ||
    normalized.includes('no changes made')
  ) {
    return esToast.noChangesApplied || 'No se aplicaron cambios';
  }
  if (normalized.includes('copied')) {
    return str.replace(/copied/i, 'copiado');
  }
  if (/cannot remove more than \d+ available seats/i.test(normalized)) {
    const num = normalized.match(/\d+/)?.[0] || '';
    return `No se pueden eliminar más de ${num} cupos disponibles`;
  }
  if (normalized.includes('remove seats must be greater than 0')) {
    return (
      esToast.removeSeatsGreaterZero ||
      'El número de cupos a eliminar debe ser mayor que 0'
    );
  }
  if (normalized.includes('request seats must be greater than 0')) {
    return (
      esToast.requestSeatsGreaterZero ||
      'La solicitud de cupos debe ser mayor que 0'
    );
  }
  if (normalized.includes('invite has expired')) {
    return esToast.inviteExpired || 'La invitación ha caducado';
  }
  if (normalized.includes('invalid or expired invite')) {
    return esToast.inviteInvalidOrExpired || 'Invitación inválida o caducada';
  }
  if (normalized.includes('invitation link is invalid or has expired')) {
    return (
      esToast.inviteLinkInvalidOrExpired ||
      'Este enlace de invitación es inválido o ha caducado.'
    );
  }
  if (normalized.includes('internal server error')) {
    return esToast.internalServerError || 'Error interno del servidor';
  }

  return str;
}
