import type { Preview } from 'storybook/preview-api';
import '../app/globals.css';
import adelanteTheme from './adelante-theme';

const preview: Preview = {
  parameters: {
    docs: {
      theme: adelanteTheme,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light',   value: '#F3F3F3' },
        { name: 'white',   value: '#FFFFFF' },
        { name: 'dark',    value: '#0A0A0A' },
      ],
    },
    layout: 'centered',
    viewport: {
      viewports: {
        mobile:  { name: 'Mobile',  styles: { width: '375px',  height: '812px' } },
        tablet:  { name: 'Tablet',  styles: { width: '768px',  height: '1024px' } },
        desktop: { name: 'Desktop', styles: { width: '1280px', height: '800px' } },
      },
    },
  },
  tags: ['autodocs'],
};

export default preview;
