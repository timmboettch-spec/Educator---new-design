import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import xss from 'xss';

@Injectable()
export class XssMiddleware implements NestMiddleware {
  private readonly xssOptions: XSS.IFilterXSSOptions = {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style', 'iframe', 'frame', 'object', 'embed', 'img'],
    allowCommentTag: false,
  };

  use(req: Request, res: Response, next: NextFunction): void {
    req.body = this.sanitize(req.body);
    next();
  }

  private sanitize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    } else if (typeof value === 'object' && value !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const key in value as Record<string, unknown>) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          sanitized[key] = this.sanitize((value as Record<string, unknown>)[key]);
        }
      }
      return sanitized;
    } else if (typeof value === 'string') {
      return xss(value, this.xssOptions);
    } else {
      return value;
    }
  }
}
