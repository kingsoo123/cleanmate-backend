export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailIdentifier(value: string): boolean {
  return value.trim().includes('@');
}
