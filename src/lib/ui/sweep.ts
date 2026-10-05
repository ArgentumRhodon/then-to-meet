/**
 * Calls `visit` at points along the line from (x0, y0) to (x1, y1), a few pixels apart and ending
 * on the last one. A fast pointer jumps over cells between events, so painting by dragging checks
 * the path between them rather than only where the pointer landed.
 */
export const sweep = (
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	visit: (x: number, y: number) => void,
	spacing = 6
): void => {
	const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / spacing));
	for (let i = 1; i <= steps; i++) {
		visit(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
	}
};
