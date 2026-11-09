import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { UPLOADS_DIR } from "./lib/uploads-path";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  // printed on every boot: if this line ever moves, files written earlier are
  // in the *other* folder and every download would 404 (see lib/uploads-path)
  new Logger("Bootstrap").log(`uploads folder: ${UPLOADS_DIR}`);
  await app.listen(process.env.PORT ?? 3002);
}

bootstrap().catch((err: unknown) => {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "EADDRINUSE") {
    const port = process.env.PORT ?? 3002;
    console.error(
      `\n[API] Port ${port} is already in use — another dev instance is probably still running.\n` +
        `      Stop the old one first, e.g. run \`npm run ports\` at the repo root to see who owns it,\n` +
        `      or run only \`npm run dev\` (root) — it starts BOTH web and API.\n`
    );
    process.exit(1);
  }
  throw err;
});
