import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

const DEFAULT_PORT = 4002;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port, "0.0.0.0");
  Logger.log(`Wallets service listening on port ${port}`, "Bootstrap");
}

void bootstrap();
