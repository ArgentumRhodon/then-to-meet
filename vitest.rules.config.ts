import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/**
 * Tests that run against the Firebase emulators, to check firestore.rules and the store together.
 * They need Java and the emulators running, so `npm run test:rules` starts them (see package.json).
 * The normal `npm test` doesn't include them.
 */
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['rules-tests/**/*.test.ts'],
		environment: 'node',
		// One emulator, one database: tests share it, so they take turns.
		fileParallelism: false,
		testTimeout: 30_000,
		hookTimeout: 30_000
	}
});
