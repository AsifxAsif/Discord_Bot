import {
	DiscordSDK
} from '@discord/embedded-app-sdk';
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
export async function connectDiscord() {
	if (!CLIENT_ID) {
		throw new Error('VITE_CLIENT_ID is missing. Set it in the hosting environment or project-root .env.');
	}
	const discordSdk = new DiscordSDK(CLIENT_ID);
	await discordSdk.ready();
	const {
		code
	} = await discordSdk.commands.authorize({
		client_id: CLIENT_ID,
		response_type: 'code',
		state: '',
		prompt: 'none',
		// guilds is required for server-side admin checks.
		scope: ['identify', 'guilds', 'applications.commands'],
	});
	const response = await fetch('/api/activity/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			code
		}),
	});
	const token = await response.json();
	if (!response.ok || !token.access_token) {
		throw new Error(token.error || 'Discord authorization failed.');
	}
	const auth = await discordSdk.commands.authenticate({
		access_token: token.access_token,
	});
	if (!auth?.user?.id) {
		throw new Error('Discord did not return your user identity.');
	}
	if (!discordSdk.instanceId) {
		throw new Error('Discord did not provide an Activity instance ID. Close and relaunch the Activity.');
	}
	return {
		sdk: discordSdk,
		user: auth.user,
		accessToken: token.access_token,
		instanceId: discordSdk.instanceId,
	};
}
