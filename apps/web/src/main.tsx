import { createRoot } from 'react-dom/client';

import { App } from './App';
import { fontFaceCss } from './fonts';
import { buildTokensCss } from './lib/tokensCss';
import './styles.css';

const style = document.createElement('style');
style.textContent = `${fontFaceCss()}\n${buildTokensCss()}`;
document.head.prepend(style);
document.documentElement.dataset.theme = 'calm';

// No StrictMode: its doubled effects in development would double every audited staff read.
createRoot(document.getElementById('root')!).render(<App />);
