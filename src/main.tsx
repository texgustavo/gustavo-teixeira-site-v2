import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';

// NOTA: removemos React.StrictMode propositalmente.
// StrictMode em React 18 dev monta useEffect 2x, o que pode criar 2 instâncias do Canvas R3F
// sobrepostas — gera bug visual de "letterbox" no shader fullscreen.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
