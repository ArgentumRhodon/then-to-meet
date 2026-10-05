import { onlyNew, readLegacy, type StorageLike } from '$lib/events/legacy';
import { toast } from '$lib/ui/toast.svelte';

/** Reads and removes keys; just what migrating needs from `localStorage`. */
type RemovableStorage = StorageLike & Pick<Storage, 'removeItem'>;

/** How many events are saved at once. */
const PARALLEL = 8;

let running: Promise<boolean> | null = null;

const browserStorage = (): RemovableStorage | null => {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
};

const run = async (uid: string, storage: RemovableStorage): Promise<boolean> => {
	const legacy = readLegacy(storage);
	if (!legacy.keys.length) return false;

	let saved = 0;
	let failed = false;
	if (legacy.settings.theme || legacy.settings.heat || legacy.events.size) {
		const [client, store] = await Promise.all([
			import('$lib/firebase/client'),
			import('$lib/events/userStore')
		]);
		const db = client.getClientDb();

		try {
			const fields = onlyNew(await store.loadSettings(db, uid), legacy.settings);
			if (Object.keys(fields).length) {
				await store.saveSettings(db, uid, fields);
				saved++;
			}
		} catch (e) {
			failed = true;
			console.warn('Moving saved settings to your account failed', e);
		}

		const queue = [...legacy.events];
		const worker = async () => {
			for (let next = queue.pop(); next; next = queue.pop()) {
				const [id, data] = next;
				try {
					// What the account already holds wins, so an old browser can't undo newer choices.
					const fields = onlyNew(await store.loadEventData(db, uid, id), data);
					if (Object.keys(fields).length) {
						await store.saveEventData(db, uid, id, fields);
						saved++;
					}
				} catch (e) {
					failed = true;
					console.warn(`Moving saved data for ${id} to your account failed`, e);
				}
			}
		};
		await Promise.all(Array.from({ length: PARALLEL }, worker));
	}

	// Only once everything is safe in the account: a failure leaves the keys for the next sign-in.
	if (failed) return false;
	for (const key of legacy.keys) {
		try {
			storage.removeItem(key);
		} catch {
			// Not being able to clear it just means it's looked at (and found already saved) again.
		}
	}
	if (saved) toast.show('Moved your saved events and settings to your account');
	return saved > 0;
};

/**
 * Carries what earlier versions kept in this browser (recent events, each event's setup and
 * groups, theme and palette) into the signed-in account, once, and then clears it from the
 * browser. Returns whether anything was moved. Safe to call on every sign-in: with nothing left
 * to move it reads a few keys and stops.
 */
export const migrateLegacy = (uid: string, storage = browserStorage()): Promise<boolean> => {
	if (!storage) return Promise.resolve(false);
	running ??= run(uid, storage)
		.catch((e) => {
			console.warn('Moving saved data to your account failed', e);
			return false;
		})
		.finally(() => (running = null));
	return running;
};
