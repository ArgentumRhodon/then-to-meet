<script lang="ts">
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';

	export let msg: string;

	const popupHover: PopupSettings = {
		event: 'click',
		target: 'popupHover',
		placement: 'bottom'
	};
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css"
		integrity="sha512-Kc323vGBEqzTmouAECnVceyQqyqdsSiqLQISBL29aUW4U/M7pSPA/gEUZQqv1cwx4OnYxTxve5UMg5GT6L4JJg=="
		crossorigin="anonymous"
		referrerpolicy="no-referrer"
	/>
</svelte:head>

<button
	class="btn-icon variant-ringed-warning btn-icon-sm w-[33px] h-[33px] [&>*]:pointer-events-none"
	use:popup={popupHover}
>
	<i class="fa-solid fa-question"></i>
</button>

<div class="card p-4 variant-filled-warning z-10 shadow-xl max-w-96" data-popup="popupHover">
	<p>{msg}</p>
	<div class="arrow variant-filled-warning" />
</div>
