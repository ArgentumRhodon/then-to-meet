/** Inputs that don't take typing, so keys like Escape are free for the page while they're focused. */
const CLICK_INPUTS = new Set([
	'checkbox',
	'radio',
	'button',
	'submit',
	'reset',
	'range',
	'color',
	'file'
]);

/** Whether `el` is a field that uses the keyboard itself, so page shortcuts should leave it be. */
export const isTyping = (el: Element | null): boolean =>
	(el instanceof HTMLInputElement && !CLICK_INPUTS.has(el.type)) ||
	el instanceof HTMLTextAreaElement ||
	el instanceof HTMLSelectElement ||
	(el instanceof HTMLElement && el.isContentEditable);
