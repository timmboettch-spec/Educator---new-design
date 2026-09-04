import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  Appcontroller(): string {
    return this.appService.AppService();
  }

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
