<script lang="ts">
	import { goto } from '$app/navigation';

	export let loadLink: (link: string) => void;

	let inputLink: string = '';

	const onSubmit = (e: Event) => {
		e.preventDefault();

		const meetingIDRegex: RegExp = /(?<=\?)\d+-\w+/g;

		let match;

		if ((match = meetingIDRegex.exec(inputLink)) !== null) {
			try {
				console.log(match[0]);
				loadLink(match[0]);
				goto(`/?${encodeURIComponent(match[0])}`);
			} catch (e) {
				throw new Error(
					'Failed to load link/ID. Ensure it is correct and check your network connection.'
				);
			}
		} else {
			throw new Error('Bad link/ID.');
		}
	};
</script>

<form class="input-group sm:grid-cols-[auto_1fr_auto] lg:grid-cols-none" on:submit={onSubmit}>
	<label for="link" class="input-group-shim p-4">When2meet Link</label>
	<input
		type="text"
		name="link"
		class="input p-4"
		placeholder="https://www.when2meet.com/..."
		required
		bind:value={inputLink}
	/>
	<button class="btn variant-filled-primary p-4" type="submit">Load Meeting</button>
</form>
