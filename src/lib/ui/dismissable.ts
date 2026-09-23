import type { Attachment } from 'svelte/attachments';

/** Calls `onDismiss` on a pointer press outside the element or on Escape. */
export const dismissable =
	(onDismiss: () => void): Attachment<HTMLElement> =>
	(node) => {
		const onPointer = (e: PointerEvent) => {
			if (!node.contains(e.target as Node)) onDismiss();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onDismiss();
		};
		document.addEventListener('pointerdown', onPointer, true);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointer, true);
			document.removeEventListener('keydown', onKey);
		};
	};
