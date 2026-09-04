import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from '../store';

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'queries'>,
) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
    options,
  );
}
