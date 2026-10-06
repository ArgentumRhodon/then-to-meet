export interface ToastAction {
	label: string;
	run: () => void;
}

/**
 * How long a toast stays up: a moment to notice it, then time to read it at an unhurried pace
 * (about 200 words a minute), and longer when it has a button to reach.
 */
export const toastDuration = (message: string, action: boolean): number =>
	Math.max(action ? 10_000 : 4000, 1500 + message.length * 60);

/** The pause before a message is written for screen readers, so even a repeat is new text. */
export const SPEAK_DELAY = 50;

class Toast {
	message = $state<string | null>(null);
	action = $state.raw<ToastAction | null>(null);
	/** Whether the message reports a failure, which gets a warning icon rather than a check. */
	error = $state(false);
	/**
	 * The message as screen readers get it. It's cleared and written again a moment later, since a
	 * live region says nothing when its text doesn't change ("Link copied" twice in a row).
	 */
	spoken = $state('');
	#timer: ReturnType<typeof setTimeout> | undefined;
	#speak: ReturnType<typeof setTimeout> | undefined;
	#duration = 0;

	/** Shows a message, with an optional button (like Undo) that stays up a little longer. */
	show(message: string, action: ToastAction | null = null, { error = false } = {}) {
		this.message = message;
		this.action = action;
		this.error = error;
		this.#duration = toastDuration(message, !!action);
		this.spoken = '';
		clearTimeout(this.#speak);
		this.#speak = setTimeout(() => (this.spoken = message), SPEAK_DELAY);
		this.resume();
	}

	/** Shows that something didn't work. */
	fail(message: string) {
		this.show(message, null, { error: true });
	}

	/** Holds the toast while someone is pointing at it or has its button focused. */
	pause() {
		clearTimeout(this.#timer);
	}

	resume() {
		clearTimeout(this.#timer);
		if (this.message) this.#timer = setTimeout(() => this.hide(), this.#duration);
	}

	hide() {
		clearTimeout(this.#timer);
		this.message = null;
		this.action = null;
		this.error = false;
	}
}

export const toast = new Toast();

export const copyText = async (text: string, confirmation = 'Copied'): Promise<void> => {
	try {
		await navigator.clipboard.writeText(text);
		toast.show(confirmation);
	} catch {
		toast.fail("Couldn't copy. Your browser blocked clipboard access.");
	}
};
