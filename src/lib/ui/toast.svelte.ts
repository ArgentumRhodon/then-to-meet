export interface ToastAction {
	label: string;
	run: () => void;
}

class Toast {
	message = $state<string | null>(null);
	action = $state.raw<ToastAction | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	/** Shows a message, with an optional button (like Undo) that stays up a little longer. */
	show(message: string, action: ToastAction | null = null) {
		this.message = message;
		this.action = action;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.hide(), action ? 5000 : 2200);
	}

	hide() {
		clearTimeout(this.#timer);
		this.message = null;
		this.action = null;
	}
}

export const toast = new Toast();

export const copyText = async (text: string, confirmation = 'Copied'): Promise<void> => {
	try {
		await navigator.clipboard.writeText(text);
		toast.show(confirmation);
	} catch {
		toast.show("Couldn't copy. Your browser blocked clipboard access.");
	}
};
