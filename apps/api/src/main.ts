import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // The installed Nest 11 websocket packages expose compatible runtime APIs,
  // but their minor versions currently produce an overly narrow adapter type.
  app.useWebSocketAdapter(
    new IoAdapter(app) as unknown as Parameters<typeof app.useWebSocketAdapter>[0],
  );
  app.use(json({ limit: '4mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const candidate = req.headers['x-request-id'];
    (req as typeof req & { requestId?: string }).requestId = typeof candidate === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(candidate) ? candidate : randomUUID();
    next();
  });
  const allowedOrigins = new Set(
    [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      process.env.FRONTEND_URL,
      process.env.WEB_APP_URL,
    ].filter((origin): origin is string => Boolean(origin)),
  );

  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      if (
        process.env.NODE_ENV !== 'production' &&
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}):5173$/.test(
          origin,
        )
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`BeePlan API is listening on port ${port}`);
}
void bootstrap();
