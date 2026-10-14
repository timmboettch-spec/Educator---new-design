import { HttpStatus } from '@nestjs/common';
import { IResponse } from '../interfaces/response.interface';

export class ResponseResult<T, M extends object = object> {
  public message?: string;
  public data?: T;
  /** Sibling of `data`, not nested inside it — e.g. pagination info for a list endpoint. */
  public meta?: M;
  public statusCode?: HttpStatus;

  constructor(responseResult: IResponse<T, M>) {
    this.message = responseResult.message;
    this.data = responseResult.data;
    this.meta = responseResult.meta;
    this.statusCode = responseResult.statusCode;
  }
}
