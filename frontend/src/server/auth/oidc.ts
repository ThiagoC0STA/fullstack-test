import {
  authConfig,
  internalEndpoints,
  publicEndpoints,
  redirectUri,
} from "./config";

/**
 * Back-channel token operations against Keycloak. The client is public
 * (PKCE), so no secret is needed; the verifier proves the caller started
 * the flow.
 */

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
}

export function buildAuthorizeUrl(params: { state: string; challenge: string }): string {
  const url = new URL(publicEndpoints.authorize);
  url.searchParams.set("client_id", authConfig.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function buildLogoutUrl(idToken: string | undefined): string {
  const url = new URL(publicEndpoints.logout);
  url.searchParams.set("post_logout_redirect_uri", authConfig.appUrl);
  if (idToken) {
    url.searchParams.set("id_token_hint", idToken);
  } else {
    url.searchParams.set("client_id", authConfig.clientId);
  }
  return url.toString();
}

async function postToken(body: URLSearchParams): Promise<TokenSet> {
  const response = await fetch(internalEndpoints.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Token endpoint returned ${response.status}`);
  }
  return (await response.json()) as TokenSet;
}

export function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: authConfig.clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    }),
  );
}

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: authConfig.clientId,
      refresh_token: refreshToken,
    }),
  );
}
