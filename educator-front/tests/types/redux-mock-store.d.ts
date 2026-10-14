/**
 * Types for `redux-mock-store`, which ships none. Covers the API the tests use:
 * `configureStore(middlewares)(state)` returning a store that records actions.
 */
declare module 'redux-mock-store' {
  import type { Middleware, Store, UnknownAction } from 'redux';

  export interface MockStoreEnhanced<S = unknown> extends Store<S> {
    getActions(): UnknownAction[];
    clearActions(): void;
  }

  export type MockStoreCreator<S = unknown> = (
    state?: S | (() => S)
  ) => MockStoreEnhanced<S>;

  export default function configureStore<S = unknown>(
    middlewares?: Middleware[]
  ): MockStoreCreator<S>;
}
