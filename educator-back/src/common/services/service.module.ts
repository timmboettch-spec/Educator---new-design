// services/services.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClsModule } from 'nestjs-cls';
import { TokenService } from './token.service';
import { AzureBlobService } from './azure-blob.service';
import { LoggerService } from './logger.service';
import { AudioNormalizerService } from './audio-normalizer.service';
import { AutomationAccessService } from './automation-access.service';
import { OutboundHttpClient } from './outbound-http.client';

@Global()
@Module({
    imports: [ConfigModule, JwtModule.register({}), ClsModule],
    providers: [
        TokenService,
        AzureBlobService,
        LoggerService,
        AudioNormalizerService,
        AutomationAccessService,
        OutboundHttpClient,
    ],
    exports: [
        TokenService,
        AzureBlobService,
        LoggerService,
        AudioNormalizerService,
        AutomationAccessService,
        OutboundHttpClient,
    ],
})
export class ServicesModule { }
