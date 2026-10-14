import { BrowserRouter as Router } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { AppRouter } from './routes/AppRouter';
import SessionRestorer from './routes/SessionRestorer';

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <Router>
        <SessionRestorer />
        <AppRouter />
      </Router>
    </I18nextProvider>
  );
}

export default App;
