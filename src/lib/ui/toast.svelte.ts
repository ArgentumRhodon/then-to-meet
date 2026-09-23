class Toast {
	message = $state<string | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	show(message: string) {
		this.message = message;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.message = null), 2200);
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
