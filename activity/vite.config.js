import {
	defineConfig,
	loadEnv
} from 'vite';
export default defineConfig(({
	mode
}) => {
	// Read environment variables from the project root.
	const env = loadEnv(mode, '..', '');
	// Support both variable names.
	const clientId = process.env.VITE_CLIENT_ID || process.env.CLIENTID || env.VITE_CLIENT_ID || env.CLIENTID || '1559205652205936762';
	if (!clientId) {
		console.warn('[Vite] Discord Application ID is missing during build!');
	} else {
		console.log('[Vite] Discord Application ID configured.');
	}
	return {
		envDir: '..',
		// Explicitly inject the ID into the frontend.
		define: {
			'import.meta.env.VITE_CLIENT_ID': JSON.stringify(clientId)
		},
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
				}
			}
		},
		build: {
			outDir: 'dist',
			emptyOutDir: true
		}
	};
});
