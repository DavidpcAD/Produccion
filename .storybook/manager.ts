import { addons } from 'storybook/manager-api';
import adelanteTheme from './adelante-theme';

addons.setConfig({
  theme: adelanteTheme,
  sidebar: {
    showRoots: true,
  },
});
