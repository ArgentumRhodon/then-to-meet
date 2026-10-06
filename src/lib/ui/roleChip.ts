/**
 * Colors for a name by role, matching the Required and Optional badges in the people list.
 * Optional names are also set in italics, so the difference doesn't rest on color alone.
 */
export const roleChip = (role: string): string =>
	role === 'optional' ? 'bg-subtle text-fg-2 italic' : 'bg-secondary-soft text-secondary-fg';
