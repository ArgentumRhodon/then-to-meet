import type { Attachment } from 'svelte/attachments';

/** Space kept between a dropdown and the edge of the window. */
const MARGIN = 8;

/**
 * Nudges a dropdown sideways so it stays on screen. It still opens from its button, but one that
 * opens near an edge (a narrow screen, or header buttons that wrapped onto their own line) would
 * otherwise be cut off or widen the page.
 */
export const keepInView: Attachment<HTMLElement> = (node) => {
	const { left, right } = node.getBoundingClientRect();
	const width = document.documentElement.clientWidth;
	const shift = left < MARGIN ? MARGIN - left : right > width - MARGIN ? width - MARGIN - right : 0;
	if (shift) node.style.translate = `${shift}px 0`;
};
