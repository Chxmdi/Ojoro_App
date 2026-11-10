import { createRoot } from 'react-dom/client';

import { fontFaceCss } from '../fonts';
import { buildTokensCss } from '../lib/tokensCss';
import '../styles.css';
import { DeleteAccountPage } from './DeleteAccountPage';

// The public "Delete your Ojoro account" page: its own entry (delete-account/index.html), so it needs no
// staff session and shares nothing with the staff tool but the styles.
const style = document.createElement('style');
style.textContent = `${fontFaceCss()}\n${buildTokensCss()}`;
document.head.prepend(style);
document.documentElement.dataset.theme = 'calm';

createRoot(document.getElementById('root')!).render(<DeleteAccountPage />);
