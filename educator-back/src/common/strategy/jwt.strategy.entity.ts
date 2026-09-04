export interface JwtPayload {
  sub: string;
  email: string;
  type: string;
  roles?: string[];
  adminId?: string | null;
  user_id?: string | null;
  student_id?: string | null;
  student_name?: string | null;
  iat?: number;
  exp?: number;
}

export interface OtpTokenPayload {
  email: string;
  purpose: 'otp_verify';
  otp: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export interface ResetTokenPayload {
  email: string;
  purpose: 'reset_password';
  /** Selected role for dual-role accounts — determines which password gets reset */
  role?: string;
  iat?: number;
  exp?: number;
}
