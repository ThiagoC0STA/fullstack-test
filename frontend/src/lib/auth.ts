import { UserManager, WebStorageStateStore } from "oidc-client-ts";
import { appConfig } from "./config";

let manager: UserManager | null = null;

/**
 * OIDC authorization code + PKCE against Keycloak. oidc-client-ts
 * handles the PKCE verifier/challenge, token exchange, storage and
 * silent renewal; we only orchestrate redirects.
 */
export function getUserManager(): UserManager {
  if (typeof window === "undefined") {
    throw new Error("Auth is browser-only");
  }
  if (!manager) {
    manager = new UserManager({
      authority: `${appConfig.keycloakUrl}/realms/${appConfig.keycloakRealm}`,
      client_id: appConfig.keycloakClientId,
      redirect_uri: `${appConfig.appUrl}/callback`,
      post_logout_redirect_uri: appConfig.appUrl,
      response_type: "code",
      scope: "openid profile",
      userStore: new WebStorageStateStore({ store: window.localStorage }),
      automaticSilentRenew: true,
    });
  }
  return manager;
}
