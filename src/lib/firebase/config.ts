import { env } from '$env/dynamic/public';

/**
 * Whether accounts are set up. Without the web app's keys, ThenToMeet runs as it always has, on
 * When2Meet links alone, and nothing in the app reaches for Firebase.
 */
export const accountsEnabled = (): boolean =>
	Boolean(env.PUBLIC_FIREBASE_API_KEY && env.PUBLIC_FIREBASE_PROJECT_ID);

export const firebaseConfig = () => ({
	apiKey: env.PUBLIC_FIREBASE_API_KEY,
	authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
	appId: env.PUBLIC_FIREBASE_APP_ID
});

/** Whether the browser should talk to the local emulators (`npm run emulators`). */
export const useEmulators = (): boolean => env.PUBLIC_FIREBASE_EMULATORS === 'true';
