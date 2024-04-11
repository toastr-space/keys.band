<script lang="ts">
	import Icon from '@iconify/svelte';
	import { timeAgo } from '$lib/utility';

	import { createEventDispatcher } from 'svelte';
	import { timeStop, isAlways, isAccepted } from '$lib/stores/data';

	export let domain = '';

	const dispatcher = createEventDispatcher();

	$: time = $isAlways
		? $isAccepted
			? 'Trusted'
			: 'Never'
		: timeAgo.format($timeStop).replace('in ', 'Expire in ');
</script>

<div
	class="justify-center items-stretch bg-surface-400 dark:bg-black bg-opacity-50 flex w-full flex-col mt-3 p-4 rounded-2xl"
>
	<div class="justify-between items-stretch flex gap-0">
		<div
			class="text-gray-800 dark:text-gray-400 text-opacity-70 text-xs font-semibold leading-4 tracking-[2px] w-[252px]"
		>
			AUTHORIZED APP
		</div>
		<div
			class="text-xs leading-4 whitespace-nowrap"
			class:text-pink-600={$isAccepted}
			class:text-gray-400={!$isAccepted}
			class:dark:text-teal-400={$isAccepted}
			class:dark:text-gray-600={!$isAccepted}
		>
			{time}
		</div>
	</div>
	<div class="justify-between items-stretch flex gap-5 mt-2">
		<div class="text-black dark:text-white text-2xl font-semibold leading-7 truncate">{domain}</div>
		<div class="bg-opacity-50">
			<button
				class="btn btn-sm text-gray-500 px-0 py-0"
				on:click={() => {
					dispatcher('showAuthorization', true);
				}}
			>
				<Icon icon="mingcute:settings-2-line" width={26} />
			</button>
		</div>
	</div>
</div>
