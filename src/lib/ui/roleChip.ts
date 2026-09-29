/** Colors for a name by role, matching the Required and Optional badges in the people list. */
export const roleChip = (role: string): string =>
	role === 'optional' ? 'bg-subtle text-fg-2' : 'bg-secondary-soft text-secondary-fg';
