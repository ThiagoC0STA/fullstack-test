import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { WalletDomainError } from "../../domain/errors";
import { WalletNotFoundError } from "../../application/use-cases/get-wallet.use-case";

interface JsonCapableResponse {
  status(code: number): { json(body: unknown): void };
}

/** Maps domain errors to the API envelope without leaking stack traces. */
@Catch(WalletDomainError)
export class WalletDomainExceptionFilter implements ExceptionFilter {
  catch(exception: WalletDomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonCapableResponse>();
    const status =
      exception instanceof WalletNotFoundError
        ? HttpStatus.NOT_FOUND
        : HttpStatus.UNPROCESSABLE_ENTITY;
    response.status(status).json({
      success: false,
      data: null,
      error: exception.message,
    });
  }
}
