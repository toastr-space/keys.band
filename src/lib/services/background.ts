import type { Message, MessageSender, Responders } from '$lib/types';
import type { WebSite, Authorization, Profile } from '$lib/types/profile';

import { finishEvent, getPublicKey, nip04 } from 'nostr-tools';
import { urlToDomain, web, BrowserUtil, ProfileUtil } from '../utility';
import { userProfile } from '$lib/stores/data';
import { AllowKind } from '$lib/types';
import { get } from 'svelte/store';
import { profileController } from '$lib/controllers/profile.controller';
import { sessionController } from '$lib/controllers/session.controller';
import { backgroundController } from '$lib/controllers/background.controller';
import { browserController } from '$lib/controllers';

const background = backgroundController();
const session = sessionController();



web.runtime.onInstalled.addListener(() => BrowserUtil.injectJsinAllTabs('content.js'));
web.runtime.onStartup.addListener(() => BrowserUtil.injectJsinAllTabs('content.js'));
web.tabs.onActivated.addListener(async (activeInfo) => browserController.switchIcon(activeInfo));
BrowserUtil.getCurrentTab().then((tab) => browserController.switchIcon({ tabId: tab.id as number }));

const responders: Responders = {};
const requestQueue: any[] = [];

const hasWebSiteAlreadyLogged = async (domain: string): Promise<Profile> => {
	const allUsers = get(await profileController.loadProfiles()) as Profile[];
	let lastDate = new Date(0);
	let currentProfile: Profile | undefined;
	for (const user of allUsers) {
		const webSites = user.data?.webSites as { [key: string]: WebSite };
		if (webSites !== undefined && domain in webSites) {
			const history = webSites[domain].history || [];
			for (const h of history) {
				if (h.type === 'getPublicKey') {
					const date = new Date(h.created_at);
					if (date > lastDate) {
						currentProfile = user as Profile;
						lastDate = date;
					}
				}
			}
		}
	}

	return currentProfile || (await background.getUserProfile());
};

const makeResponse = async (type: string, data: any) => {
	await profileController.loadProfiles();
	const user = get(userProfile);
	const privateKey: string = user.data?.privateKey || '';
	let res;

	switch (type) {
		case 'getPublicKey':
			res = getPublicKey(privateKey);
			break;
		case 'getRelays':
			res = user.data?.relays?.map((relay) => {
				return { url: relay?.url };
			});
			break;
		case 'signEvent':
			res = data;
			if (res?.pubkey == null || res?.pubkey === undefined || res?.pubkey === '') {
				const pk = getPublicKey(privateKey);
				res.pubkey = pk;
			}
			res = finishEvent(res, privateKey);
			break;
		case 'nip04.decrypt':
			try {
				res = await nip04.decrypt(privateKey, data.peer, data.ciphertext);
			} catch (e) {
				res = {
					error: {
						message: 'Error while decrypting data',
						stack: e
					}
				};
			}
			break;
		case 'nip04.encrypt':
			try {
				res = await nip04.encrypt(privateKey, data.peer, data.plaintext);
			} catch (e) {
				res = {
					error: {
						message: 'Error while encrypting data',
						stack: e
					}
				};
			}
			break;
		default:
			res = null;
	}
	return res;
};

async function manageResult(message: Message, sender: any) {
	try {
		if (message.response === undefined) return;
		const responderData = responders[message.requestId as string];
		if (!responderData) return;

		const domain = responderData.domain;
		const user = get(userProfile);
		const site: WebSite = ProfileUtil.getWebSiteOrCreate(domain, user);

		await background.updatePermisison(
			message.response.permission,
			site,
			responderData.domain,
			responderData.type
		);

		if (message.response.error)
			responderData.resolve({
				id: message.requestId,
				type: responderData.type,
				ext: 'keys.band',
				response: {
					error: {
						message: 'User rejected the request',
						stack: 'User rejected the request'
					}
				}
			});
		else
			responderData.resolve({
				id: message.requestId,
				type: responderData.type,
				ext: 'keys.band',
				response: await makeResponse(responderData.type, responderData.data)
			});
	} catch (e) {
		console.error(e);
	}

	web.windows.remove(sender.tab.windowId);
	delete responders[message.requestId as string];
	return;
}

const pushHistory = async (yes: boolean, message: Message) => {
	const domain = urlToDomain(message.url || '');
	await background.addHistory(
		{
			acceptance: yes,
			type: message.type
		},
		domain
	);
};

const isAllow = async (domain: string): Promise<AllowKind> => {
	const user = await background.getUserProfile();
	const site: WebSite = ProfileUtil.getWebSiteOrCreate(domain, user);
	const permission: Authorization = site.permission as Authorization;

	if (permission.accept) {
		if (permission.always) return AllowKind.AlWaysAllow;
		else {
			if (new Date(permission.authorizationStop || '') > new Date()) {
				return AllowKind.AllowForSession;
			} else return AllowKind.Nothing;
		}
	} else if (permission.reject) {
		if (permission.always) return AllowKind.AlwaysReject;
		else {
			if (new Date(permission.authorizationStop || '') > new Date())
				return AllowKind.RejectForSession;
			else return AllowKind.Nothing;
		}
	} else return AllowKind.Nothing;
};

const buildResponseMessage = (message: Message, response: any): any => {
	return {
		id: message.id,
		type: message.type,
		ext: 'keys.band',
		response: response || {
			error: {
				message: 'User rejected the request',
				stack: 'User rejected the request'
			}
		},
		url: message.url
	};
};

/*eslint no-async-promise-executor: 0*/
async function manageRequest(
	message: Message,
	resolver: any = null,
	next: boolean = false
): Promise<any> {
	return new Promise(async (res) => {
		const resolve: Promise<any> | any = resolver || res;

		const user = await background.getUserProfile();
		const domain = urlToDomain(message.url || '');

		if (next === false) {
			requestQueue.push({ message, resolver: resolve });
			return;
		}

		const previousProfile = await hasWebSiteAlreadyLogged(domain);

		if (user.data?.privateKey === undefined)
			return Promise.resolve(
				buildResponseMessage(message, {
					error: {
						message: 'User rejected the request',
						stack: 'User rejected the request'
					}
				})
			);

		const access: AllowKind = await isAllow(domain);
		if (message.type === 'getPublicKey')
			if (previousProfile.id !== user.id) access === AllowKind.Nothing;

		switch (access) {
			case AllowKind.AlWaysAllow:
				await pushHistory(true, message);
				return resolve(
					buildResponseMessage(
						message,
						await makeResponse(message.type, message.params.event || message.params)
					)
				);
			case AllowKind.AlwaysReject:
				await pushHistory(false, message);
				return resolve(
					buildResponseMessage(message, {
						error: {
							message: 'User rejected the request',
							stack: 'User rejected the request'
						}
					})
				);
			case AllowKind.AllowForSession:
				await pushHistory(true, message);
				return resolve(
					buildResponseMessage(
						message,
						await makeResponse(message.type, message.params?.event || message.params)
					)
				);
			case AllowKind.RejectForSession:
				await pushHistory(false, message);
				return resolve(
					buildResponseMessage(message, {
						error: {
							message: 'User rejected the request',
							stack: 'User rejected the request'
						}
					})
				);
			case AllowKind.Nothing:
				break;
		}

		responders[message.id] = {
			resolve,
			domain,
			type: message.type,
			data: message.params.event || message.params
		};

		const dataId = await session.add({
			action: 'login',
			url: message.url,
			requestId: message.id,
			type: message.type,
			data: message.params.event || message.params || '{}' || '',
			previousProfile
		});

		await BrowserUtil.createWindow('popup.html?query=' + btoa(dataId));
	});
}

const proceedNextRequest = async () => {
	const popupWindow = (await web.windows.getAll()).find((win) => win.type === 'popup');
	if (popupWindow === undefined && requestQueue.length > 0) {
		const { message, resolver } = requestQueue.shift();
		manageRequest(message, resolver, true);
	}
};

setInterval(async () => proceedNextRequest(), 100);

web.runtime.onMessage.addListener((message: Message, sender: MessageSender, sendResponse) => {
	if (message.prompt) {
		manageResult(message, sender);
		sendResponse({ message: true });
	} else {
		const i = setInterval(async () => {
			manageRequest(message)
				.then(async (data) => {
					sendResponse(data);
				})
				.catch((err) => {
					console.error(err);
				})
				.finally(() => {
					proceedNextRequest();
				});
			clearInterval(i);
		}, Math.random() * 100);
	}

	return true;
});
