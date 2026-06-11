import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import type {
  ApiResponse,
  BetView,
  PaginatedResponse,
  PlayerBetHistoryItem,
  RoundHistoryItem,
  RoundSnapshot,
  RoundVerification,
} from "@crash/contracts";
import { RoundQueries } from "../../application/round-queries";
import { CashOutUseCase } from "../../application/use-cases/cash-out.use-case";
import { PlaceBetUseCase } from "../../application/use-cases/place-bet.use-case";
import {
  type AuthenticatedPlayer,
  CurrentPlayer,
  KeycloakJwtGuard,
} from "@crash/platform";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

export class PlaceBetRequestDto {
  @ApiProperty({ example: "1000", description: "Bet amount in integer cents" })
  amountCents!: string;
}

function parsePagination(page?: string, limit?: string): { page: number; limit: number } {
  const parsedPage = Number(page ?? "1");
  const parsedLimit = Number(limit ?? String(DEFAULT_PAGE_LIMIT));
  return {
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    limit:
      Number.isSafeInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_PAGE_LIMIT)
        : DEFAULT_PAGE_LIMIT,
  };
}

@ApiTags("games")
@Controller()
export class GamesController {
  constructor(
    private readonly placeBetUseCase: PlaceBetUseCase,
    private readonly cashOutUseCase: CashOutUseCase,
    private readonly queries: RoundQueries,
  ) {}

  @Get("health")
  @ApiOperation({ summary: "Service liveness probe" })
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "games" };
  }

  @Get("rounds/current")
  @ApiOperation({ summary: "Current round state with bets" })
  current(): ApiResponse<RoundSnapshot | null> {
    return { success: true, data: this.queries.getCurrentSnapshot(), error: null };
  }

  @Get("rounds/history")
  @ApiOperation({ summary: "Paginated history of crashed rounds" })
  async history(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<PaginatedResponse<RoundHistoryItem>> {
    const pagination = parsePagination(page, limit);
    const result = await this.queries.getHistory(pagination);
    return {
      success: true,
      data: result.items,
      error: null,
      meta: { total: result.total, page: pagination.page, limit: pagination.limit },
    };
  }

  @Get("rounds/:roundId/verify")
  @ApiOperation({ summary: "Provably fair verification data for a crashed round" })
  async verify(
    @Param("roundId") roundId: string,
  ): Promise<ApiResponse<RoundVerification>> {
    const verification = await this.queries.getVerification(roundId);
    if (!verification) {
      throw new NotFoundException(
        "Round not found or not yet crashed (seeds are only revealed after the crash)",
      );
    }
    return { success: true, data: verification, error: null };
  }

  @Get("bets/me")
  @UseGuards(KeycloakJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Authenticated player's bet history" })
  async myBets(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<PaginatedResponse<PlayerBetHistoryItem>> {
    const pagination = parsePagination(page, limit);
    const result = await this.queries.getPlayerBets({
      playerId: player.id,
      ...pagination,
    });
    return {
      success: true,
      data: result.items,
      error: null,
      meta: { total: result.total, page: pagination.page, limit: pagination.limit },
    };
  }

  @Post("bet")
  @UseGuards(KeycloakJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Places a bet in the current betting window (settles via wallet saga)",
  })
  async placeBet(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Body() body: PlaceBetRequestDto,
  ): Promise<ApiResponse<BetView>> {
    const bet = await this.placeBetUseCase.execute({
      playerId: player.id,
      username: player.username,
      amountCents: String(body.amountCents ?? ""),
    });
    return { success: true, data: bet, error: null };
  }

  @Post("bet/cashout")
  @UseGuards(KeycloakJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Cashes out the player's active bet at the server-side multiplier" })
  async cashOut(
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiResponse<BetView>> {
    const bet = await this.cashOutUseCase.execute({ playerId: player.id });
    return { success: true, data: bet, error: null };
  }
}
