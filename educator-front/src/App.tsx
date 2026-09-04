import { BrowserRouter as Router } from 'react-router-dom';
import { AppRouter } from './routes/AppRouter';
import SessionRestorer from './routes/SessionRestorer';

function App() {
  return (
    <Router>
      <SessionRestorer />
      <AppRouter />
    </Router>
  );
}

export default App;
