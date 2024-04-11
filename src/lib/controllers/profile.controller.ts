/*eslint no-async-promise-executor: 0*/

import { ProfileDeleteMethod } from '$lib/types/profile.d';
import { get, type Writable } from 'svelte/store';
import { NostrUtil } from '$lib/utility';
import { getPublicKey } from 'nostr-tools';
import type {
	Duration,
	Profile,
	ProfileController,
	Relay
} from '$lib/types/profile.d';
import {
	duration,
	profiles,
	userProfile,
	theme,
	browser
} from '$lib/stores/data';

// GENERAL SETTINGS
const loadDuration = async (): Promise<void> => {
	return new Promise(async (resolve, reject) => {
		try {
			const value = await browser.get('duration');
			if (value?.duration) duration.set(value?.duration as Duration);
			else {
				browser.set({
					duration: {
						name: 'One time',
						value: 0
					}
				});
				duration.set({
					name: 'One time',
					value: 0
				});
			}
			resolve();
		} catch (err) {
			reject(err);
		}
	});
};

const updateDuration = async (newDuration: Duration): Promise<void> => {
	return new Promise((resolve, reject) => {
		try {
			browser.set({ duration: newDuration });
			duration.set(newDuration);
			resolve();
		} catch (err) {
			reject(err);
		}
	});
};


const loadTheme = async (): Promise<void> => {
	return new Promise(async (resolve, reject) => {
		try {
			const value = await browser.get('theme');
			if ("theme" in value === false) browser.set({ theme: "dark" });
			if (value?.theme !== 'dark') {
				theme.set(value?.theme as string);
				document.documentElement.classList.remove('dark');
			} else {
				browser.set({ theme: 'dark' });
				theme.set('dark');
				document.documentElement.classList.add('dark');
			}
			resolve();
		} catch (err) {
			theme.set('dark');
			document.documentElement.classList.add('dark');
			reject(err);
		}
	});
};

const switchTheme = async (themeName: string): Promise<void> => {
	return new Promise((resolve) => {
		browser.set({ theme: themeName });
		theme.set(themeName);
		if (typeof document === 'undefined') return;
		if (themeName === 'dark') document.documentElement.classList.add('dark');
		else document.documentElement.classList.remove('dark');
		browser.set({ theme: themeName });
		resolve();
	});
};

// PROFILE UTILITY
const isExistingProfile = async (name: string, key: string): Promise<boolean> => {
	try {
		const _profiles = get(profiles);
		const pkey = await NostrUtil.checkNSEC(key);
		return _profiles.findIndex((p: Profile) => p.name === name || p?.data?.privateKey === pkey) !==
			-1
			? true
			: false;
	} catch (err) {
		alert(err);
	}
	return false;
};

const settingProfile = async (profile: Profile): Promise<void> => {
	return new Promise(async (resolve, reject) => {
		try {
			await browser.set({ currentProfile: profile.id });
			resolve();
		} catch (err) {
			reject(err);
		}
	});
};

// PROFILE MANAGEMENT
const loadProfile = async (profile: Profile): Promise<boolean | Profile | undefined> => {
	try {
		if (profile.data !== undefined) {
			if (profile.data?.pubkey === undefined || profile.id === undefined) {
				profile.data.pubkey = getPublicKey(profile.data.privateKey as string);
				profile.id = profile.data.pubkey;
			}
			await settingProfile(profile);
			userProfile.set(profile);
			if (profile.data?.relays?.length || 1 > 0) {
				NostrUtil.getRelays(profile.data?.pubkey as string, true).then((event) => {
					if (event?.tags) {
						const relays_list: Relay[] = [];
						if (event.tags.length > 0)
							event.tags.forEach((relay) => {
								relays_list.push({
									url: relay[1],
									enabled: true,
									created_at: new Date(),
									access:
										relay.length > 2 ? (relay[2] === 'read' ? 0 : relay[2] === 'write' ? 1 : 2) : 2
								});
							});
						if (profile.data) profile.data.relays = relays_list;
						if (profile.id === get(userProfile).id) userProfile.set(profile);
						saveProfile(profile);
					}
					saveProfile(profile);
				});
			}
			NostrUtil.getMetadata(profile.data.pubkey as string).then((metaData) => {
				profile.metadata = metaData;
				saveProfile(profile);
				if (profile.id === get(userProfile).id) userProfile.set(profile);
			});
			return profile;
		}
	} catch (err) {
		alert(JSON.stringify(err));
		return false;
	}
};

const saveProfile = async (profile: Profile): Promise<void> => {
	try {
		const _profiles = get(profiles);
		let index;
		if (profile.id) {
			index = _profiles.findIndex((p) => p.id === profile.id);
			if (index === -1)
				index = _profiles.findIndex((p) => p.data?.privateKey === profile.data?.privateKey);
		} else index = _profiles.findIndex((p) => p.data?.privateKey === profile.data?.privateKey);
		_profiles[index] = profile;
		await browser.set({ profiles: _profiles });
		Promise.resolve();
	} catch (err) {
		Promise.reject(err);
	}
};

const deleteProfile = async (
	profile: Profile,
	method: ProfileDeleteMethod = ProfileDeleteMethod.DEFAULT
): Promise<void> => {
	return new Promise((resolve) => {
		if (method === ProfileDeleteMethod.DEFAULT) {
			const _profiles = get(profiles);

			const index = _profiles.findIndex((p) => p.name === profile.name);
			_profiles.splice(index, 1);
			profiles.set(_profiles);
			if (get(userProfile)?.id === profile.id) {
				loadProfile(_profiles[0] ?? {});
			}
			saveProfiles();
			resolve();
		}
	});
};

const createProfile = async (
	name: string,
	key: string,
	metadata?: any,
	relays?: any
): Promise<boolean> => {
	return new Promise(async function (resolve, reject) {
		if (name.length < 4) {
			reject('Name must be at least 4 characters');
			return;
		}

		const privateKey = (await NostrUtil.checkNSEC(key)) as string;

		try {
			if ((await isExistingProfile(name, privateKey)) === true) {
				reject('Name or key already exists');
				return;
			}

			const profile: Profile = {
				name: name,
				id: getPublicKey(privateKey),
				metadata: metadata,
				data: {
					pubkey: getPublicKey(privateKey),
					privateKey,
					webSites: {},
					relays
				}
			};
			profiles.update((profiles) => [...profiles, profile]);
			saveProfiles();
			const metaData = await NostrUtil.getMetadata(getPublicKey(privateKey));
			profile.metadata = metaData;
			await loadProfile(profile);

			resolve(true);
		} catch (error) {
			reject(error);
		}
	});
};

const loadProfiles = async (): Promise<Writable<Profile[]>> => {
	return new Promise(async (resolve, reject) => {
		try {
			const value = await browser.get('profiles');
			if (value?.profiles) profiles.set((value?.profiles as Profile[]) || []);
			else {
				browser.set({ profiles: [] });
				profiles.set([]);
			}

			const data = await browser.get('currentProfile');

			for (const profile of get(profiles)) {
				if (
					profile.data !== undefined &&
					(profile.data?.pubkey === undefined || profile.id === undefined)
				) {
					profile.data.pubkey = getPublicKey(profile.data.privateKey as string);
					profile.id = profile.data.pubkey;
				}
				if (profile.id === data?.currentProfile) {
					userProfile.set(profile);
					await NostrUtil.prepareRelayPool();
					await loadProfile(profile);
				}

				NostrUtil.getMetadata(profile?.data?.pubkey as string).then((metaData) => {
					if ((profile.id as string) !== (data.currentProfile as string)) {
						profile.metadata = metaData;
						saveProfile(profile);
					}
				});
			}
			resolve(profiles);
		} catch (err) {
			reject(err);
		}
	});
};

const saveProfiles = async (): Promise<void> => {
	return new Promise((resolve) => {
		browser.set({ profiles: get(profiles) });
		resolve();
	});
};

const addRelayToProfile = async (relayUrl: string): Promise<void> => {
	return new Promise(async (resolve, reject) => {
		try {
			const relay: Relay = {
				url: relayUrl,
				enabled: true,
				created_at: new Date()
			};
			userProfile.update((profile) => {
				profile?.data?.relays?.push(relay);
				return profile;
			});
			await saveProfile(get(userProfile));
			NostrUtil.pushRelays(get(userProfile));
			resolve();
		} catch (err) {
			reject(err);
		}
	});
};

const removeRelayFromProfile = async (relay: Relay): Promise<void> => {
	return new Promise(async (resolve, reject) => {
		try {
			userProfile.update((profile) => {
				const index = profile?.data?.relays?.findIndex((r) => r.url === relay.url) as number;
				profile?.data?.relays?.splice(index, 1);
				return profile;
			});
			await saveProfile(get(userProfile));
			NostrUtil.pushRelays(get(userProfile));
			resolve();
		} catch (err) {
			reject(err);
		}
	});
};

export const profileController: ProfileController = {
	addRelayToProfile: addRelayToProfile,
	updateDuration: updateDuration,
	createProfile: createProfile,
	deleteProfile: deleteProfile,
	isExistingProfile: isExistingProfile,
	loadDuration: loadDuration,
	loadProfile: loadProfile,
	loadProfiles: loadProfiles,
	loadTheme: loadTheme,
	removeRelayFromProfile: removeRelayFromProfile,
	saveProfile: saveProfile,
	saveProfiles: saveProfiles,
	settingProfile: settingProfile,
	switchTheme: switchTheme,
};
