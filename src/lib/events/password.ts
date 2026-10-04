/*
 * Optional passwords on responses, enforced by firestore.rules with no server in between.
 *
 * Rules can't see a password, and a hash of it in the (public) response would let anyone copy and
 * replay it, so instead:
 *
 *   - events/{id}/secrets/{key} holds `secret`, a slow hash of the password. Nobody can read it;
 *     the rules can.
 *   - The public response holds a random `salt` (so the secret can be rebuilt from the password)
 *     and a random `nonce`.
 *   - To change a locked response, the writer sends a new nonce and a `proof`: a hash of the
 *     secret, the response's current nonce, and the new one. The rules work out the same hash from
 *     the real secret and compare. Anyone reading the response sees only the salt, the nonce, and
 *     the last proof, which is good for nothing once the nonce has moved on.
 *
 * The string hashed for a proof must match the rules exactly:
 *   secret + '|' + currentNonce + '|' + newNonce
 * (and for removing a password, 'remove' in place of the new nonce). The rules' hex output is
 * uppercase, so they lowercase it before comparing; proofs here are lowercase hex.
 */

/** PBKDF2 rounds. Slow enough to blunt guessing, fast enough for a phone. */
export const PBKDF2_ROUNDS = 100_000;
export const MAX_PASSWORD = 100;
/** Most rounds a salt may ask for. It comes from a public document, so a hostile one can't stall a visitor's tab. */
const MAX_ROUNDS = 1_000_000;

const hex = (bytes: ArrayBuffer | Uint8Array): string =>
	Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

const unhex = (text: string): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(text.length / 2));
	for (let i = 0; i < out.length; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
	return out;
};

const random = (bytes: number): string => hex(crypto.getRandomValues(new Uint8Array(bytes)));

/** A new salt, tagged with the round count it goes with, like `100000$9f2c...`. */
export const newSalt = (): string => `${PBKDF2_ROUNDS}$${random(16)}`;

/** A fresh 32-character nonce. */
export const newNonce = (): string => random(16);

const SALT = /^(\d{1,7})\$([0-9a-f]{32})$/;

/** The secret for a password and a response's salt: 64 hex characters. */
export const deriveSecret = async (password: string, salt: string): Promise<string> => {
	const match = SALT.exec(salt);
	if (!match || Number(match[1]) < 1 || Number(match[1]) > MAX_ROUNDS) {
		throw new Error('This entry has a password setting this app does not understand.');
	}
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(match[2]), iterations: Number(match[1]) },
		key,
		256
	);
	return hex(bits);
};

/**
 * Stands in for the new nonce in the proof that a password is being removed. An entry without a
 * password has no nonce to move, so the proof is bound to this word instead.
 */
export const REMOVE = 'remove';

/** The proof that goes with a change, for the response's current nonce and a new one. */
export const proofFor = async (
	secret: string,
	currentNonce: string,
	newNonce: string
): Promise<string> => {
	const data = new TextEncoder().encode(`${secret}|${currentNonce}|${newNonce}`);
	return hex(await crypto.subtle.digest('SHA-256', data));
};
