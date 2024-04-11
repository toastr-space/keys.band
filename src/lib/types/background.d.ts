enum MessageType {
	GET_PUBLIC_KEY = 'getPublicKey',
	GET_RELAYS = 'getRelays',
	SIGN_EVENT = 'signEvent',
	NIP04_DECRYPT = 'nip04.decrypt',
	NIP04_ENCRYPT = 'nip04.encrypt'
}

interface Message {
	id: string;
	requestId?: string | number | undefined;
	prompt?: boolean | undefined; // popup message
	response?: boolean | undefined | any; // only when its reply
	type: MessageType | string;
	params: any | undefined;
	url: string | undefined;
}

interface MessageSender extends chrome.runtime.MessageSender {
	id?: string | undefined;
	origin?: string | undefined;
	url?: string | undefined;
	tab?: chrome.tabs.Tab | undefined;
}

interface PopupParams {
	action?: string;
	type: string;
	data?: any;
	url?: string | undefined;
	requestId?: string | undefined;
	origin?: string;
	permissions?: string[];
	previousProfile?: Profile;
}

interface SessionManager {
	add?: (data: any) => Promise<string>;
	remove?: (id: string) => Promise<void>;
	getById: (id: string) => Promise<any>;
}

interface PermissionDuration {
	always: boolean;
	accept: boolean;
	reject: boolean;
	duration: Date;
}

interface BackgroundController {
	updatePermisison: (
		duration: PermissionDuration,
		site: WebSite,
		domain: string,
		type: string
	) => Promise<void>;
	getUserProfile: () => Promise<Profile>;
	addHistory: (info: { acceptance: boolean; type: string }, domain: string) => Promise<void>;
}

enum AllowKind {
	AlWaysAllow,
	AlwaysReject,
	AllowForSession,
	RejectForSession,
	Nothing
}

interface Responders {
	[key: string]: {
		resolve: (value?: any) => void;
		type: string;
		data: any;
		domain: string;
	};
}

export {
	Message,
	MessageSender,
	MessageType,
	PopupParams,
	AllowKind,
	SessionManager,
	BackgroundController,
	PermissionDuration,
	Responders
};
