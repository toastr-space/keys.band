import { getDuration, urlToDomain } from '$lib/utility';
import { web } from '$lib/utility';

import type { Browser, Profile, WebSite } from '$lib/types';
import { backgroundController } from './background.controller';

const createBrowserController = (): Browser => {
	const get = async (key: string): Promise<{ [key: string]: unknown }> => {
		try {
			const result = await web?.storage?.local?.get(key);
			return result;
		} catch (err) {
			return Promise.reject(err);
		}
	};
	const set = async (items: { [key: string]: unknown }): Promise<void> => {
		try {
			const result = await web?.storage?.local?.set(items);
			return result;
		} catch (err) {
			return Promise.reject(err);
		}
	};

	const getCurrentTab = async (): Promise<chrome.tabs.Tab> => {
		return new Promise((resolve) => {
			web.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) =>
				resolve(tabs[0])
			);
		});
	};
	const injectJsInTab = async (tab: chrome.tabs.Tab, jsFileName: string): Promise<void> => {
		try {
			await web.scripting.executeScript({
				target: { tabId: tab.id as number },
				files: [jsFileName]
			});
			return;
		} catch (e) {
			console.error(tab.id, tab.url);
			console.error('Error injecting Nostr Provider', e);
			return Promise.reject(e);
		}
	};
	const injectJsinAllTabs = async (jsFileName: string): Promise<void> => {
		return new Promise((resolve) => {
			web.tabs.query({}, function (tabs: chrome.tabs.Tab[]) {
				tabs.forEach(async (tab) => {
					try {
						if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://'))
							return;
						await injectJsInTab(tab, jsFileName);
					} catch (e) {
						console.log('Error injecting Nostr Provider', e);
					}
				});
				resolve();
			});
		});
	};
	const switchIcon = async (activeInfo: { tabId: number }) => {
		const tab = await web.tabs.get(activeInfo.tabId);
		const user: Profile = await backgroundController().getUserProfile();
		const domain = urlToDomain(tab.url || '');
		const webSites = user.data?.webSites as { [key: string]: WebSite };
		if (webSites !== undefined && domain in webSites) {
			web.action.setIcon({
				tabId: tab.id,
				path: 'assets/logo-on.png'
			});
		} else {
			web.action.setIcon({
				tabId: tab.id,
				path: 'assets/logo-off.png'
			});
		}
	};
	const createWindow = async (url: string): Promise<chrome.windows.Window> => {
		return web.windows.create({
			url: web.runtime.getURL(url),
			width: 400,
			height: 580,
			type: 'popup'
		});
	};

	const sendAuthorizationResponse = (
		yes: boolean,
		choice: number,
		url: string | undefined,
		requestId: string | undefined
	) => {
		getCurrentTab().then((tab) => switchIcon({ tabId: tab.id as number }));
		return web.runtime.sendMessage({
			prompt: true,
			response: {
				status: yes ? 'success' : 'error',
				error: !yes,
				permission: {
					always: choice === 1,
					duration: getDuration(choice),
					accept: yes,
					reject: !yes
				}
			},
			ext: 'keys.band',
			url,
			requestId
		});
	};

	return {
		get,
		set,
		getCurrentTab,
		injectJsInTab,
		injectJsinAllTabs,
		createWindow,
		sendAuthorizationResponse,
		switchIcon
	};
};

export const browserController: Browser = createBrowserController();
