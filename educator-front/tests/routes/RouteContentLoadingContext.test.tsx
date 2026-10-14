import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  RouteContentLoadingProvider,
  useRouteContentLoading,
} from '../../src/routes/RouteContentLoadingContext';

function Consumer() {
  const loading = useRouteContentLoading();
  return <div>loading:{String(loading)}</div>;
}

describe('RouteContentLoadingContext', () => {
  it('defaults to false with no provider', () => {
    render(<Consumer />);
    expect(screen.getByText('loading:false')).toBeInTheDocument();
  });

  it('reflects the value passed to the provider', () => {
    render(
      <RouteContentLoadingProvider value>
        <Consumer />
      </RouteContentLoadingProvider>
    );
    expect(screen.getByText('loading:true')).toBeInTheDocument();
  });
});
