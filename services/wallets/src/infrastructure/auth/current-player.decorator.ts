import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthenticatedPlayer, AuthenticatedRequest } from "./keycloak-jwt.guard";

export const CurrentPlayer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPlayer => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.player) {
      throw new UnauthorizedException("Request is not authenticated");
    }
    return request.player;
  },
);
