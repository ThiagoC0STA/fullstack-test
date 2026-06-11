import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/** Injection token for the auth settings each service provides. */
export const AUTH_CONFIG = Symbol("AUTH_CONFIG");

export interface AuthConfig {
  jwksUrl: string;
  issuer: string;
}

export interface AuthenticatedPlayer {
  id: string;
  username: string;
}

export interface AuthenticatedRequest {
  player?: AuthenticatedPlayer;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Validates Keycloak-issued JWTs against the realm JWKS. The JWKS is
 * fetched lazily and cached by jose, so services boot fine even while
 * Keycloak is still starting.
 */
@Injectable()
export class KeycloakJwtGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    this.jwks = createRemoteJWKSet(new URL(config.jwksUrl));
    this.issuer = config.issuer;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token =
      typeof header === "string" && header.startsWith("Bearer ")
        ? header.slice("Bearer ".length)
        : null;
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
      request.player = toAuthenticatedPlayer(payload);
      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}

function toAuthenticatedPlayer(payload: JWTPayload): AuthenticatedPlayer {
  if (!payload.sub) {
    throw new UnauthorizedException("Token is missing the sub claim");
  }
  const preferredUsername = payload["preferred_username"];
  return {
    id: payload.sub,
    username: typeof preferredUsername === "string" ? preferredUsername : payload.sub,
  };
}
