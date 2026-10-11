import 'reflect-metadata';
import { ClassSerializerInterceptor, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { AppModule } from 'src/app.module';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from 'src/common/interceptors/response-envelope.interceptor';
import { buildOpenApiConfig } from 'src/openapi/openapi.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const reflector = app.get(Reflector);
  const expressApp = app.getHttpAdapter().getInstance() as express.Express;

  const trustedProxyHops = config.get<number>('app.trustProxyHops') ?? 0;
  expressApp.set('trust proxy', trustedProxyHops > 0 ? trustedProxyHops : false);

  app.enableShutdownHooks();
  app.use(helmet());
  app.use(compression());
  app.use(
    '/uploads',
    express.static(resolve(process.cwd(), config.get<string>('upload.localDir') ?? 'uploads')),
  );

  const origins = config.get<string>('cors.origins') ?? '';
  app.enableCors({
    origin:
      origins === '*'
        ? true
        : origins
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
    credentials: true,
  });

  const apiPrefix = config.get<string>('app.apiPrefix') ?? 'api';
  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(reflector),
    new ResponseEnvelopeInterceptor(),
  );

  if (config.get<boolean>('app.swaggerEnabled') ?? true) {
    const document = SwaggerModule.createDocument(app, buildOpenApiConfig());
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: false,
      },
    });
  }

  const port = config.get<number>('app.port') ?? 3000;
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
