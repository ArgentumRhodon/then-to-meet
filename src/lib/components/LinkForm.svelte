<script lang="ts">
	export let loadLink: (link: string) => void;

	let inputLink: string = '';
</script>

<form
	class="input-group sm:grid-cols-[auto_1fr_auto] lg:grid-cols-none"
	on:submit={() => loadLink(inputLink)}
>
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
