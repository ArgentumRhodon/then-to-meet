import type { Attachment } from 'svelte/attachments';

/**
 * Sends focus back to the button that opened a popup when the popup closes with focus inside it
 * (Escape, or picking an item), so keyboard users aren't dropped at the top of the page. The
 * button is the popup's sibling with `aria-expanded`.
 */
export const returnFocus: Attachment<HTMLElement> = (node) => {
	const opener = node.parentElement?.querySelector<HTMLElement>(':scope > [aria-expanded]');
	return () => {
		// By now the popup may already be out of the page, which leaves focus on the body. Focus
		// that has moved on to something else (Tab, or a click elsewhere) is left alone.
		const active = document.activeElement;
		if (!active || active === document.body || node.contains(active)) opener?.focus();
	};
};

const ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/**
 * The keyboard side of a `role="menu"` popup: it opens with focus on the first item, the arrow
 * keys (and Home and End) move between items, Tab closes it, and closing puts focus back on its
 * button. Escape and clicks outside are `dismissable`'s job.
 */
export const menu =
	(close: () => void): Attachment<HTMLElement> =>
	(node) => {
		const items = () =>
			[...node.querySelectorAll<HTMLElement>(ITEMS)].filter(
				(item) => !(item as HTMLButtonElement).disabled
			);
		const onkeydown = (e: KeyboardEvent) => {
			// The settings menu turns into a timezone search, which isn't a menu.
			if (node.getAttribute('role') !== 'menu') return;
			if (e.key === 'Tab') return close();
			const list = items();
			const at = list.indexOf(document.activeElement as HTMLElement);
			const next =
				e.key === 'ArrowDown'
					? (at + 1) % list.length
					: e.key === 'ArrowUp'
						? (at - 1 + list.length) % list.length
						: e.key === 'Home'
							? 0
							: e.key === 'End'
								? list.length - 1
								: null;
			if (next === null || !list.length) return;
			e.preventDefault();
			list[next].focus();
		};
		const restore = returnFocus(node);
		node.addEventListener('keydown', onkeydown);
		items()[0]?.focus();
		return () => {
			node.removeEventListener('keydown', onkeydown);
			restore?.();
		};
	};
