// vite.config.ts im Plugin
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
    plugins: [
        angular({
            tsconfig: './tsconfig.json',
        }),
    ],
    build: {
        lib: {
            entry: './src/index.ts',
            formats: ['es'],
            fileName: 'index',
        },
        rollupOptions: {
            external: [
                '@angular/core',
                '@angular/common',
                '@angular/router',
                '@angular/elements',
                '@kaelteflow/frontend-sdk',
                'rxjs',
            ],
        },
    },
});