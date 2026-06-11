import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { MikroORM } from "@mikro-orm/core";
import { AppModule } from "./app.module";

const DEFAULT_PORT = 4001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: ["http://localhost:3000"] });

  const orm = app.get(MikroORM);
  await orm.migrator.up();
  Logger.log("Database migrations applied", "Bootstrap");

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Crash Game - Games Service")
    .setDescription(
      "Round lifecycle, bets, cashouts, provably fair verification and websocket push",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port, "0.0.0.0");
  Logger.log(`Games service listening on port ${port}`, "Bootstrap");
}

void bootstrap();
