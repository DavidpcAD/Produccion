import { create } from 'storybook/theming/create';

export default create({
  base: 'dark',

  // Brand
  brandTitle: 'Adelante Design System',
  brandUrl:   'https://adelante.cr',
  brandTarget: '_blank',

  // UI chrome
  colorPrimary:   '#ADD010',
  colorSecondary: '#ADD010',

  // App background
  appBg:           '#0A0A0A',
  appContentBg:    '#111111',
  appPreviewBg:    '#F3F3F3',
  appBorderColor:  '#1E1E1E',
  appBorderRadius: 8,

  // Typography
  fontBase: '"Roboto", "Segoe UI", sans-serif',
  fontCode: '"Fira Code", "Consolas", monospace',

  // Text
  textColor:         '#FFFFFF',
  textInverseColor:  '#000000',
  textMutedColor:    '#747B86',

  // Toolbar
  barTextColor:         '#AAAFB6',
  barHoverColor:        '#ADD010',
  barSelectedColor:     '#ADD010',
  barBg:                '#0A0A0A',

  // Input
  inputBg:            '#1A1A1A',
  inputBorder:        '#2A2A2A',
  inputTextColor:     '#FFFFFF',
  inputBorderRadius:  8,

  // Buttons
  buttonBg:           '#1A1A1A',
  buttonBorder:       '#2A2A2A',
  booleanBg:          '#1A1A1A',
  booleanSelectedBg:  '#ADD010',
});
