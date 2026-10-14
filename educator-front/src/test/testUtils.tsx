import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { store } from '../store';

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'queries'>
) {
  return render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter>{ui}</BrowserRouter>
      </I18nextProvider>
    </Provider>,
    options
  );
}
