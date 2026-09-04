import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  AppService(): string {
    return 'getFunction is working!';
  }
}
