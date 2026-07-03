let currentAccessToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentAccessToken = token;
}

export function getAuthToken(): string | null {
  return currentAccessToken;
}
