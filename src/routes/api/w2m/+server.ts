import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch, url }) => {
	const response: Response = await fetch(`https://www.when2meet.com/${url.search}`, {
		headers: {
			Accept:
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8'
		}
	});
	const responseText: string = await response.text();
	return new Response(responseText);
};
