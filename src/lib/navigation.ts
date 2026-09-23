import { goto } from '$app/navigation';

/** Navigates to an event; the page's afterNavigate hook does the loading. */
export const openEvent = (id: string) => goto(`/?e=${encodeURIComponent(id)}`);

export const closeEvent = () => goto('/');
