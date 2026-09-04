import { Response } from 'express';
import path from 'path';
import * as express from 'express';
import { HTTP_BODY_SIZE_LIMIT } from 'src/common/constants';
import { NestExpressApplication } from '@nestjs/platform-express';

export const studentBackendConfig = (app: NestExpressApplication): void => {
  // Serve static files from public directory
  app.useStaticAssets(path.join(process.cwd(), 'public'), {
    prefix: '/',
  });

  // Return a simple HTML 404 when a file under /uploads is not found locally
  // (e.g. files that were stored in Azure Blob Storage instead of the local disk).
  // This runs AFTER the static-asset middleware, so it only fires on a miss.
  app.use('/uploads', (_req: Request, res: Response) => {
    res
      .status(404)
      .send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>404: Not Found</title>' +
          '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;height:100vh;display:flex;align-items:center;justify-content:center}' +
          '.w{display:flex;align-items:center;gap:20px}h1{font-size:24px;font-weight:600;border-right:1px solid rgba(0,0,0,.3);padding-right:20px;line-height:49px}p{font-size:14px;color:#444}</style>' +
          '</head><body><div class="w"><h1>404</h1><p>File not found.</p></div></body></html>',
      );
  });

  // Increase JSON body size limit (Express default is 100 KB, reports can exceed that)
  app.use(express.json({ limit: HTTP_BODY_SIZE_LIMIT }));
  app.use(express.urlencoded({ limit: HTTP_BODY_SIZE_LIMIT, extended: true }));
};
