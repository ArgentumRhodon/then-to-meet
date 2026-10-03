import { createHash, pbkdf2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveSecret, newNonce, newSalt, PBKDF2_ROUNDS, proofFor } from './password';

describe('newSalt and newNonce', () => {
	it('are random and shaped as the rules and deriveSecret expect', () => {
		expect(newSalt()).toMatch(new RegExp(`^${PBKDF2_ROUNDS}\\$[0-9a-f]{32}$`));
		expect(newSalt()).not.toBe(newSalt());
		// firestore.rules requires the nonce to be exactly 32 characters.
		expect(newNonce()).toMatch(/^[0-9a-f]{32}$/);
		expect(newNonce()).not.toBe(newNonce());
	});
});

describe('deriveSecret', () => {
	const salt = `1000$${'ab'.repeat(16)}`;

	it('is PBKDF2-SHA256 of the password, as 64 lowercase hex characters', async () => {
		const expected = pbkdf2Sync('hunter2', Buffer.from('ab'.repeat(16), 'hex'), 1000, 32, 'sha256');
		const secret = await deriveSecret('hunter2', salt);
		expect(secret).toBe(expected.toString('hex'));
		expect(secret).toMatch(/^[0-9a-f]{64}$/);
	});

	it('is the same for the same password and salt, and differs for either changing', async () => {
		const secret = await deriveSecret('hunter2', salt);
		expect(await deriveSecret('hunter2', salt)).toBe(secret);
		expect(await deriveSecret('hunter3', salt)).not.toBe(secret);
		expect(await deriveSecret('hunter2', `1000$${'cd'.repeat(16)}`)).not.toBe(secret);
	});

	it('handles any text, including non-ASCII', async () => {
		expect(await deriveSecret('pässwörd 🔑', salt)).toMatch(/^[0-9a-f]{64}$/);
	});

	it('refuses a salt it does not understand', async () => {
		await expect(deriveSecret('x', 'nonsense')).rejects.toThrow();
	});
});

describe('proofFor', () => {
	it('is SHA-256 of secret|current|new, the exact string the rules hash', async () => {
		const proof = await proofFor('s3cret', 'aaa', 'bbb');
		expect(proof).toBe(createHash('sha256').update('s3cret|aaa|bbb').digest('hex'));
		expect(proof).toHaveLength(64);
	});

	it('changes with any of its three inputs, so an old proof is no use for a new change', async () => {
		const proof = await proofFor('s', 'n1', 'n2');
		expect(await proofFor('t', 'n1', 'n2')).not.toBe(proof);
		expect(await proofFor('s', 'n0', 'n2')).not.toBe(proof);
		expect(await proofFor('s', 'n1', 'n3')).not.toBe(proof);
	});
});
