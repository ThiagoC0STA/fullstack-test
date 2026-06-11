import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { GameDomainError, InvalidBetAmountError } from "../../domain/errors";

interface JsonCapableResponse {
  status(code: number): { json(body: unknown): void };
}

/**
 * Maps domain errors to the API envelope: malformed amounts are 400,
 * everything else (closed betting, duplicate bet, too-late cashout) is
 * a 409 conflict with the game state.
 */
@Catch(GameDomainError)
export class GameDomainExceptionFilter implements ExceptionFilter {
  catch(exception: GameDomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonCapableResponse>();
    const status =
      exception instanceof InvalidBetAmountError
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.CONFLICT;
    response.status(status).json({
      success: false,
      data: null,
      error: exception.message,
    });
  }
}
