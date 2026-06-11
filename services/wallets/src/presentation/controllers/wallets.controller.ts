import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { ApiResponse, WalletView } from "@crash/contracts";
import { GetWalletUseCase } from "../../application/use-cases/get-wallet.use-case";
import { OpenWalletUseCase } from "../../application/use-cases/open-wallet.use-case";
import type { Wallet } from "../../domain/wallet";
import {
  type AuthenticatedPlayer,
  CurrentPlayer,
  KeycloakJwtGuard,
} from "@crash/platform";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";

function toWalletView(wallet: Wallet): WalletView {
  return {
    walletId: wallet.id,
    playerId: wallet.playerId,
    balanceCents: wallet.balanceCents,
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

@ApiTags("wallets")
@Controller()
export class WalletsController {
  constructor(
    private readonly openWallet: OpenWalletUseCase,
    private readonly getWallet: GetWalletUseCase,
  ) {}

  @Get("health")
  @ApiOperation({ summary: "Service liveness probe" })
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "wallets" };
  }

  @Post()
  @UseGuards(KeycloakJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Opens the authenticated player's wallet (idempotent)",
  })
  async open(
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiResponse<WalletView>> {
    const wallet = await this.openWallet.execute(player.id);
    return { success: true, data: toWalletView(wallet), error: null };
  }

  @Get("me")
  @UseGuards(KeycloakJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Returns the authenticated player's wallet" })
  async me(
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiResponse<WalletView>> {
    const wallet = await this.getWallet.execute(player.id);
    return { success: true, data: toWalletView(wallet), error: null };
  }
}
