import 'leaflet/dist/leaflet.css';
import 'tdesign-react/es/style/index.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'tdesign-react';
import enConfig from 'tdesign-react/es/locale/en_US';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* No Thai pack ships with TDesign; English base, all product copy is Thai. */}
    <ConfigProvider globalConfig={{ ...enConfig, animation: { exclude: ['ripple'] } }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </StrictMode>,
);
