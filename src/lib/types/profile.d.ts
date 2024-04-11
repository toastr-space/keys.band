interface Profile {
	name?: string;
	id?: string;
	metadata?: {
		name?: string;
		picture?: string;
		nip05?: string;
	};
	data?: {
		pubkey?: string;
		privateKey?: string;
		webSites?: { [url: string]: WebSite };
		relays?: Relay[];
	};
}

interface UserProfile {
	name?: string;
	picture?: string;
	nip05?: string;
}

interface Authorization {
	always: boolean;
	accept: boolean;
	reject: boolean;
	authorizationStop?: string | undefined;
}

interface WebSiteHistory {
	type: string;
	data?: unknown;
	created_at: string;
	accepted: boolean;
}

interface WebSite {
	auth: boolean;
	permission?: Authorization;
	history?: WebSiteHistory[];
}

interface ProfileSetting {
	profile: string;
	privateKey: string;
	profileName: string;
	webSites: object;
	pubkey: string;
	relays: Relay[];
}

interface RelayMetadata {
	name: string;
	description: string;
	pubkey: string;
	contact?: string;
	supported_nips?: object;
	software?: string;
	version?: string;
}

enum RelayAccess {
	READ = 0,
	WRITE = 1,
	READ_WRITE = 2
}

interface Relay {
	name?: string;
	metadata?: RelayMetadata;
	access?: RelayAccess;
	url: string;
	enabled: boolean;
	created_at: Date;
}
interface Browser {
	get: (key: string) => Promise<{ [key: string]: unknown }>;
	set: (items: { [key: string]: unknown }) => Promise<void>;
	getCurrentTab: () => Promise<chrome.tabs.Tab>;
	injectJsInTab: (tab: chrome.tabs.Tab, jsFileName: string) => Promise<void>;
	injectJsinAllTabs: (jsFileName: string) => Promise<void>;
	createWindow: (url: string) => Promise<chrome.windows.Window>;
	switchIcon: (activeInfo: { tabId: number }) => Promise<void>;
	sendAuthorizationResponse: (
		yes: boolean,
		choice: number,
		url: string | undefined,
		requestId: string | undefined
	) => Promise<void>;
}

enum ProfileDeleteMethod {
	DEFAULT,
	BY_NAME,
	BY_PRIVATE_KEY
}

interface ProfileController {
	addRelayToProfile: (relayUrl: string) => Promise<void>;
	updateDuration: (newDuration: Duration) => Promise<void>;
	createProfile: (name: string, key: string, metaData?: any, relays?: any[]) => Promise<boolean>;
	deleteProfile: (profile: Profile, method?: ProfileDeleteMethod) => Promise<void>;
	isExistingProfile: (name: string, key: string) => Promise<boolean>;
	loadDuration: () => Promise<void>;
	loadProfile: (profile: Profile) => Promise<boolean | Profile | undefined>;
	loadProfiles: () => Promise<Writable<Profile[]>>;
	loadTheme: () => Promise<void>;
	removeRelayFromProfile: (relay: Relay) => Promise<void>;
	saveProfile: (profile: Profile) => Promise<void>;
	saveProfiles: () => Promise<void>;
	settingProfile: (profile: Profile) => Promise<void>;
	switchTheme: (themeName: string) => Promise<void>;
}

interface Duration {
	name: string;
	value: number;
}

export {
	Duration,
	Profile,
	UserProfile,
	WebSite,
	WebSiteHistory,
	ProfileController,
	ProfileSetting,
	Relay,
	RelayAccess,
	ProfileDeleteMethod,
	Authorization,
	Browser
};
