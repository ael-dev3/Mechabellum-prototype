import './styles/variables.css';
import './styles/global.css';
import './styles/components.css';
import './styles/screens.css';

import { App } from './ui/App';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'app-root';
  app.appendChild(root);

  const application = new App(root);
  application.start();
}
