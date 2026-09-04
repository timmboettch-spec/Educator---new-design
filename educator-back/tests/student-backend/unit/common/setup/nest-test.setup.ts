import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { Type, Provider } from '@nestjs/common';

type NestImport =
  | Type<unknown>
  | { module: Type<unknown>; [key: string]: unknown }
  | Promise<{ module: Type<unknown>; [key: string]: unknown }>;

/**
 * Bootstrap a minimal NestJS testing module.
 * Pass providers and overrides to customise the module.
 */
export async function createTestingModule(options: {
  providers: Provider[];
  imports?: NestImport[];
  overrides?: {
    token: string | symbol | Type<unknown> | (new (...args: unknown[]) => unknown);
    useValue: unknown;
  }[];
}): Promise<TestingModule> {
  let builder = Test.createTestingModule({
    imports: options.imports ?? [],
    providers: options.providers,
  });

  for (const override of options.overrides ?? []) {
    builder = builder.overrideProvider(override.token).useValue(override.useValue);
  }

  return builder.compile();
}
