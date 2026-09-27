import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff?inline';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff?inline';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { slotAttendance, type TimeBlock } from '$lib/analysis/bestTimes';
import { formatMinuteOfDay } from '$lib/analysis/format';
import type { Grid } from '$lib/analysis/grid';
import type { Roles, W2MEvent } from '$lib/types';
import { heatHex } from './color';

/** The size unfurlers expect for a large preview image. */
export const IMAGE_WIDTH = 1200;
export const IMAGE_HEIGHT = 630;

// The dark theme from app.css, since the heatmap is always dark.
const CANVAS = '#313944';
const FG = '#cdf0f6';
const FG_2 = '#c1c7d1';
const FG_3 = '#939eae';
const ACCENT = '#06b6d4';
const GLOW =
	'radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0) 50%), ' +
	'radial-gradient(circle at 98% 1%, rgba(181, 44, 85, 0.2), rgba(181, 44, 85, 0) 50%)';

const PAD_X = 48;
const PAD_Y = 36;
/** Brand and legend. */
const HEADER = 44;
/** Weekday and date over each column. */
const DAY_LABELS = 60;
/** Hour labels left of the grid. */
const TIME_LABELS = 72;
/** Space at a break in the day, like a lunch gap. */
const BREAK = 12;
const MAX_COLUMN = 160;
const MAX_ROW = 28;

// Satori reads .woff but not .woff2, which is all the variable Inter the app uses comes in.
const font = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
const FONTS = [
	{ name: 'Inter', data: font(inter500), weight: 500 as const, style: 'normal' as const },
	{ name: 'Inter', data: font(inter600), weight: 600 as const, style: 'normal' as const }
];

/** The element tree Satori lays out, like React's without React. */
type Style = Record<string, string | number>;
type Child = Node | string;
interface Node {
	type: 'div';
	props: { style: Style; children?: Child | Child[] };
}
const div = (style: Style, children?: Child | Child[]): Node => ({
	type: 'div',
	props: { style, children }
});

export interface HeatmapImageInput {
	event: W2MEvent;
	grid: Grid;
	roles: Roles;
	/** Blocks to outline, with the rest of the grid dimmed. */
	featured: TimeBlock[];
}

const layout = ({ event, grid, roles, featured }: HeatmapImageInput): Node => {
	const { counts, total } = slotAttendance(event, roles);
	const days = grid.days.length;
	const breaks = grid.rows.filter((row) => row.gapBefore).length;

	// Cells fill the space in whole pixels, so neighbors meet without seams, and the grid is
	// centered in whatever's left over.
	const gap = days > 14 ? 2 : days > 7 ? 4 : 6;
	const areaW = IMAGE_WIDTH - 2 * PAD_X - TIME_LABELS;
	const areaH = IMAGE_HEIGHT - 2 * PAD_Y - HEADER - DAY_LABELS;
	const colW = Math.max(2, Math.min(MAX_COLUMN, Math.floor((areaW - gap * (days - 1)) / days)));
	const rowH = Math.max(
		1,
		Math.min(MAX_ROW, Math.floor((areaH - BREAK * breaks) / grid.rows.length))
	);
	const gridW = days * colW + (days - 1) * gap;
	const gridH = grid.rows.length * rowH + breaks * BREAK;
	const left = PAD_X + TIME_LABELS + Math.floor((areaW - gridW) / 2);
	const top = PAD_Y + HEADER + DAY_LABELS + Math.floor((areaH - gridH) / 2);

	const colX = (day: number) => left + day * (colW + gap);
	const rowY: number[] = [];
	let y = top;
	grid.rows.forEach((row, i) => {
		if (row.gapBefore) y += BREAK;
		rowY[i] = y;
		y += rowH;
	});
	const rowOf = new Map(grid.rows.map((row, i) => [row.minute, i]));
	const place = new Map<number, { day: number; row: number }>();
	grid.days.forEach((day, d) =>
		day.slotByMinute.forEach((slot, minute) => place.set(slot, { day: d, row: rowOf.get(minute)! }))
	);

	const featuredSlot = (slot: number) =>
		featured.some((b) => slot >= b.startSlot && slot <= b.endSlot);
	// Hour rules only where hours are tall enough for them to read as rules, not texture.
	const hourRules = rowH * (3600 / event.slotSeconds) >= 16;

	// Each day's run of rows between breaks is one rounded column segment, like the app's cells.
	const segments: [number, number][] = [];
	grid.rows.forEach((row, i) => {
		if (i === 0 || row.gapBefore) segments.push([i, i]);
		else segments[segments.length - 1][1] = i;
	});
	const columns = grid.days.flatMap((day, d) =>
		segments.map(([first, last]) =>
			div(
				{
					position: 'absolute',
					left: colX(d),
					top: rowY[first],
					width: colW,
					height: (last - first + 1) * rowH,
					display: 'flex',
					flexDirection: 'column',
					borderRadius: Math.min(6, colW / 2),
					overflow: 'hidden',
					// Dimmed cells fade into the page color, not the glow behind it.
					backgroundColor: CANVAS
				},
				grid.rows.slice(first, last + 1).map((row, i) => {
					const slot = day.slotByMinute.get(row.minute);
					return div({
						width: colW,
						height: rowH,
						flexShrink: 0,
						backgroundColor: slot === undefined ? 'transparent' : heatHex(counts[slot], total),
						opacity: slot !== undefined && featured.length && !featuredSlot(slot) ? 0.45 : 1,
						...(hourRules && row.hour && i > 0 ? { borderTop: `1px solid ${CANVAS}` } : {})
					});
				})
			)
		)
	);

	// Rings like the app's outline: the accent, then a gap in the page color.
	const outlines = featured.flatMap((block) => {
		const start = place.get(block.startSlot);
		const end = place.get(block.endSlot);
		if (!start || !end) return [];
		const [x, y0, y1] = [colX(start.day), rowY[start.row], rowY[end.row] + rowH];
		const ring = (spread: number, width: number, color: string) =>
			div({
				position: 'absolute',
				left: x - spread,
				top: y0 - spread,
				width: colW + 2 * spread,
				height: y1 - y0 + 2 * spread,
				border: `${width}px solid ${color}`,
				borderRadius: 6 + spread
			});
		return [ring(5, 2, CANVAS), ring(3, 3, ACCENT)];
	});

	// Weekday over date, shortened to fit narrow columns.
	const dayLabels =
		colW < 20
			? []
			: grid.days.map((day, d) => {
					const weekday = colW < 40 ? day.weekday.slice(0, 2) : day.weekday;
					const date = colW < 64 ? day.dayOfMonth : day.date;
					return div(
						{
							position: 'absolute',
							left: colX(d) - gap / 2,
							top: top - DAY_LABELS,
							width: colW + gap,
							height: DAY_LABELS - 12,
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'flex-end'
						},
						[
							div(
								{ fontSize: colW < 40 ? 13 : 15, color: FG_3, letterSpacing: 1 },
								weekday.toUpperCase()
							),
							...(date === null
								? []
								: [
										div({ fontSize: colW < 40 ? 15 : 20, fontWeight: 600, color: FG }, String(date))
									])
						]
					);
				});

	// Hour labels on their rules, skipping any that would crowd the one above.
	const timeLabels: Node[] = [];
	let lastLabel = -Infinity;
	grid.rows.forEach((row, i) => {
		const startsSegment = i === 0 || row.gapBefore;
		if (!row.hour && !startsSegment) return;
		const labelTop = startsSegment ? rowY[i] : rowY[i] - 9;
		if (labelTop - lastLabel < 22) return;
		lastLabel = labelTop;
		timeLabels.push(
			div(
				{
					position: 'absolute',
					left: left - TIME_LABELS,
					top: labelTop,
					width: TIME_LABELS - 12,
					display: 'flex',
					justifyContent: 'flex-end',
					fontSize: 15,
					color: FG_3
				},
				formatMinuteOfDay(row.minute)
			)
		);
	});

	const steps = Math.min(total, 6);
	const legend = div(
		{
			position: 'absolute',
			right: PAD_X,
			top: PAD_Y,
			height: 32,
			display: 'flex',
			alignItems: 'center',
			fontSize: 18,
			color: FG_2
		},
		[
			div({ marginRight: 10 }, '0'),
			div(
				{ display: 'flex' },
				Array.from({ length: steps + 1 }, (_, i) =>
					div({
						width: 24,
						height: 14,
						marginLeft: i ? 3 : 0,
						borderRadius: 3,
						backgroundColor: heatHex(i, steps)
					})
				)
			),
			div({ marginLeft: 10 }, `${total} available`)
		]
	);

	return div(
		{
			width: IMAGE_WIDTH,
			height: IMAGE_HEIGHT,
			display: 'flex',
			position: 'relative',
			fontFamily: 'Inter',
			fontWeight: 500,
			backgroundColor: CANVAS,
			backgroundImage: GLOW
		},
		[
			div(
				{
					position: 'absolute',
					left: PAD_X,
					top: PAD_Y,
					height: 32,
					display: 'flex',
					alignItems: 'center',
					fontSize: 26,
					fontWeight: 600,
					color: FG,
					letterSpacing: -0.5
				},
				'ThenToMeet'
			),
			legend,
			...dayLabels,
			...timeLabels,
			...columns,
			...outlines
		]
	);
};

/** A PNG of the event's heatmap, for link previews. */
export const renderHeatmapImage = async (
	input: HeatmapImageInput
): Promise<Uint8Array<ArrayBuffer>> => {
	const svg = await satori(layout(input), {
		width: IMAGE_WIDTH,
		height: IMAGE_HEIGHT,
		fonts: FONTS
	});
	// Copied out of Node's Buffer into a plain array, which a Response body takes.
	return new Uint8Array(new Resvg(svg).render().asPng());
};
