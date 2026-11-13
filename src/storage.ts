const PERSONAL_KEYS = ['md2din5008:source:v2', 'md2din5008:source', 'md2din5008:signature', 'md2din5008:logo'];

export function migratePersonalData() {
  for (const key of PERSONAL_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value === null) continue;
      if (key !== 'md2din5008:source' && sessionStorage.getItem(key) === null) sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    } catch {
    }
  }
}

export function sessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function sessionSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
  }
}

export function sessionRemove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
  }
}
