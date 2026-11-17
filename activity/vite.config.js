import {
	defineConfig
} from 'vite';
export default defineConfig({
	// Read VITE_CLIENT_ID from the project-root .env, shared with the bot.
	envDir: '..',
	server: {
		host: '0.0.0.0',
		port: 5173,
		strictPort: true,
		proxy: {
			'/api': {
				target: process.env.BOT_API_ORIGIN || 'http://127.0.0.1:8080',
				changeOrigin: true
			},
			'/ws': {
				target: (process.env.BOT_API_ORIGIN || 'http://127.0.0.1:8080').replace(/^http/, 'ws'),
				ws: true
			},
		},
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
	},
});
