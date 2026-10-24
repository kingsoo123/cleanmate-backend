import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { ServiceAccount } from 'firebase-admin';

export function loadFirebaseServiceAccount(
  jsonInline: string | undefined,
  filePath: string | undefined,
): ServiceAccount | null {
  if (jsonInline?.trim()) {
    return JSON.parse(jsonInline.trim()) as ServiceAccount;
  }

  const configuredPath = filePath?.trim();
  if (!configuredPath) {
    return null;
  }

  const absolutePath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(process.cwd(), configuredPath);

  const raw = readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw) as ServiceAccount;
}
