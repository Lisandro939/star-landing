// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
import node from '@astrojs/node';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  integrations: [icon()],

  vite: {
    plugins: [tailwindcss()]
  }
});