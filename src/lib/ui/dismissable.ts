import type { Attachment } from 'svelte/attachments';

/** Calls `onDismiss` on a pointer press outside the element, on Escape, or when focus leaves it. */
export const dismissable =
	(onDismiss: () => void): Attachment<HTMLElement> =>
	(node) => {
		const onPointer = (e: PointerEvent) => {
			if (!node.contains(e.target as Node)) onDismiss();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			// Marks the key as used, so page-level Escape handlers leave their state alone.
			e.preventDefault();
			onDismiss();
		};
		// Tabbing past a popup closes it, so it doesn't sit over whatever has focus next.
		const onFocusOut = (e: FocusEvent) => {
			const next = e.relatedTarget as Node | null;
			if (next && !node.contains(next)) onDismiss();
		};
		document.addEventListener('pointerdown', onPointer, true);
		document.addEventListener('keydown', onKey);
		node.addEventListener('focusout', onFocusOut);
		return () => {
			document.removeEventListener('pointerdown', onPointer, true);
			document.removeEventListener('keydown', onKey);
			node.removeEventListener('focusout', onFocusOut);
		};
	};
