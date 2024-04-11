import { get } from 'svelte/store';
import { getDuration } from '../utility/utils';
import { userProfile } from '$lib/stores/data';
import { ProfileUtil } from '$lib/utility';
import { profileController } from '$lib/controllers/profile.controller';
import { browserController } from '$lib/controllers';

const accept = async (accept: boolean, domain: string, choice: number = 0) => {
	try {
		const webSites = get(userProfile)?.data?.webSites || {};
		const site = ProfileUtil.getWebSiteOrCreate(domain, get(userProfile));
		site.permission = {
			always: choice === 1,
			authorizationStop: getDuration(choice)?.toString(),
			accept: accept,
			reject: !accept
		};

		const arr = site.history || [];
		arr.push({
			accepted: accept,
			type: 'permission',
			created_at: new Date().toString(),
			data: undefined
		});

		site['history'] = arr;
		webSites[domain] = site;
		userProfile.update((x: any) => {
			if (x.data !== undefined || x.data !== null) {
				x.data.webSites = webSites;
				return x;
			}
		});

		browserController.getCurrentTab().then((tab) => browserController.switchIcon({ tabId: tab.id as number }));

		profileController.saveProfile(get(userProfile));

		return true;
	} catch (err) {
		alert(err);
	}
};

export { accept };
