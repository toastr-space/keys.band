import { getEventHash, getPublicKey, getSignature, nip04 } from "nostr-tools";
import { domainToUrl, web } from "../stores/utils";
import {
  profileControlleur
} from "../stores/key-store";

import type {
  WebSite
} from "$lib/types/profile"

import {
  webSites, webNotifications, keyStore, userProfile
} from "$lib/stores/data"
import { get } from "svelte/store";
import type { Message, MessageSender, PopupParams } from "$lib/types";
import { BrowserUtil, ProfileUtil } from "$lib/utility";

const loadNotifications = profileControlleur.loadNotifications

web.runtime.onInstalled.addListener(function () {
  BrowserUtil.injectJsinAllTabs("content.js");
});

web.runtime.onStartup.addListener(() => {
  BrowserUtil.injectJsinAllTabs("content.js");
});

// end of injection

const responders: {
  [key: string]: {
    resolve: (value?: any) => void;
    type: string;
    data: any;
    domain: string;
  };
} = {};

async function updatePermission(
  duration: {
    always: boolean;
    accept: boolean;
    reject: boolean;
    duration: Date;
  },
  site: WebSite,
  domain: string,
  type: string,
) {
  await profileControlleur.loadProfiles();
  const user = get(userProfile)
  let _webSites = get(webSites);
  if (!_webSites) {
    _webSites = {};
  }
  if (duration.always === true) {
    site.auth = true;
    site.permission = {
      always: true,
      accept: duration.accept,
      reject: duration.reject,
    };

    _webSites[domain] = site;

    user.data.webSites = _webSites;
    await profileControlleur.saveProfile(user);
    return true;
  } else {
    site.auth = true;
    site.permission = {
      always: false,
      accept: duration.accept,
      reject: duration.reject,
      authorizationStop: duration.duration,
    };

    _webSites[domain] = site;

    user.data.webSites = _webSites;
    await profileControlleur.saveProfile(user);

    await addHistory(
      {
        acceptance: duration.accept,
        type: type,
      },
      domain
    );

    return true;
  }
}

async function makeResponse(type: string, data: any) {
  await profileControlleur.loadProfiles();
  const user = get(userProfile)
  let res;
  switch (type) {
    case "getPublicKey":
      res = getPublicKey(user?.data?.privateKey || "");
      break;
    case "getRelays":
      res = user.data?.relays?.map((relay) => {
        return { url: relay?.url };
      });
      break;
    case "signEvent":
      res = data;
      if (res.pubkey == null) {
        const pk = getPublicKey(get(keyStore));
        res.pubkey = pk;
      }
      res.id = getEventHash(res);
      res.sig = getSignature(res, get(keyStore));
      break;
    case "nip04.decrypt":
      try {
        res = await nip04.decrypt(get(keyStore), data.peer, data.ciphertext);
      } catch (e) {
        res = {
          error: {
            message: "Error while decrypting data",
            stack: e,
          },
        };
      }
      break;
    case "nip04.encrypt":
      try {
        res = await nip04.encrypt(get(keyStore), data.peer, data.plaintext);
      } catch (e) {
        res = {
          error: {
            message: "Error while encrypting data",
            stack: e,
          },
        };
      }
      break;
    default:
      res = null;
  }
  return res;
}

async function showNotification(type: string, accepted: boolean) {
  await loadNotifications();
  const _notifications = get(webNotifications);
  _notifications.forEach((notification) => {
    if (type.indexOf(notification.name) !== -1 && notification.state === true) {
      web.notifications.create({
        type: "basic",
        iconUrl: "https://toastr.space/images/toastr/body.png",
        title: type + " permission requested",
        message:
          "Permission " + (accepted ? "accepted" : "rejected") + " for " + type,
        priority: 0,
      });
    }
  });
}

async function addHistory(
  info: { acceptance: boolean; type: string },
  domain: string
) {
  await showNotification(info.type, info.acceptance);
  await profileControlleur.loadProfiles();
  const user = get(userProfile)
  let _webSites = user.data?.webSites;
  if (_webSites === undefined || _webSites === null) {
    _webSites = {};
  }
  if (Object.keys(_webSites).indexOf(domain) !== -1) {
    let site = _webSites[domain];
    if (site === undefined || site === null) {
      site = {};
    }
    let array = site.history || [];
    array.push({
      accepted: info.acceptance,
      type: info.type,
      created_at: new Date().toString(),
      data: undefined,
    });
    site["history"] = array;
    _webSites[domain] = site;

    user.data.webSites = _webSites;
    await profileControlleur.saveProfile(user);
  } else {
    const site = {
      auth: false,
      permission: {
        always: false,
        accept: true,
        reject: false,
      },
      history: [
        {
          accepted: info.acceptance,
          type: info.type,
          created_at: new Date().toString(),
        },
      ],
    };

    _webSites[domain] = site;
    user.data.webSites = _webSites;
    await profileControlleur.saveProfile(user);
  }
}

async function manageResult(message: Message, sender: any) {
  if (message.response === undefined) return
  const responderData = responders[message.requestId as string];
  if (!responderData) return

  const domain = responderData.domain;
  const user = get(userProfile)
  const site: WebSite = ProfileUtil.getWebSiteOrCreate(domain, user);

  await updatePermission(
    message.response.permission,
    site,
    responderData.domain,
    responderData.type
  );

  if (message.response.error) {
    responderData.resolve({
      id: message.requestId,
      type: responderData.type,
      ext: "keys.band",
      response: {
        error: {
          message: "User rejected the request",
          stack: "User rejected the request",
        },
      },
    });
  } else {
    responderData.resolve({
      id: message.requestId,
      type: responderData.type,
      ext: "keys.band",
      response: await makeResponse(
        responderData.type,
        responderData.data
      )
    });
  }

  web.windows.remove(sender.tab.windowId);
  delete responders[message.requestId as string];
  return;
}

async function manageRequest(message: any) {
  return new Promise(async (resolve) => {
    profileControlleur.loadProfiles();
    const user = get(userProfile)
    let site;
    let resolved: boolean = false;
    if (user.data?.privateKey === undefined) {
      resolved = true;
      resolve({
        id: message.id,
        type: message.type,
        ext: "keys.band",
        response: {
          error: {
            message: "No private key found",
            stack: "No private key found",
          },
        },
      });
      return;
    }

    try {
      site = (user?.data?.webSites as WebSite[])[domainToUrl(message.url)];
    } catch (e) {
      site = undefined;
    }

    if (site) {
      if (
        site.auth &&
        (site.permission.accept !== undefined ||
          site.permission.always !== undefined)
      ) {
        if (site.permission.accept && site.permission.always) {
          const res = await makeResponse(
            message.type,
            message.params.event || message.params,
            domainToUrl(message.url)
          );

          addHistory(
            {
              acceptance: true,
              type: message.type,
            },
            domainToUrl(message.url)
          );

          resolved = true;
          resolve({
            id: message.id,
            type: message.type,
            ext: "keys.band",
            response: res,
          });
          return;
        } else if (site.permission.accept && !site.permission.always) {
          if (new Date(site.permission.authorizationStop) > new Date()) {
            const res = await makeResponse(
              message.type,
              message.params.event || message.params,
              domainToUrl(message.url)
            );

            addHistory(
              {
                acceptance: true,
                type: message.type,
              },
              domainToUrl(message.url)
            );

            resolved = true;
            resolve({
              id: message.id,
              type: message.type,
              ext: "keys.band",
              response: res,
            });
            return;
          }
        } else {
          if (site.permission.reject) {
            if (
              new Date(site.permission.authorizationStop) < new Date() &&
              !site.permission.always
            ) {
              site.permission.reject = false;
              site.permission.accept = true;
              site.permission.always = false;
            } else {
              resolved = true;

              addHistory(
                {
                  acceptance: false,
                  type: message.type,
                },
                domainToUrl(message.url)
              );

              resolve({
                id: message.id,
                type: message.type,
                ext: "keys.band",
                response: {
                  error: {
                    message: "User rejected the request",
                    stack: "User rejected the request",
                  },
                },
              });
              return;
            }
          }
        }
      }
    }
    if (resolved) return;

    responders[message.id] = {
      resolve: resolve,
      type: message.type,
      data: message.params.event || message.params,
      domain: domainToUrl(message.url),
    };

    const data: PopupParams = {
      action: "login",
      url: message.url,
      requestId: message.id,
      type: message.type,
      data: (message.params.event || message.params || "{}") || "",
    };

    await BrowserUtil.createWindow("popup.html?query=" + btoa(JSON.stringify(data)));
  });
}



web.runtime.onMessage.addListener((message: Message, sender: MessageSender, sendResponse) => {

  if (message.prompt) {
    manageResult(message, sender);
    sendResponse({ message: true });
  } else {
    manageRequest(message).then((data) => {
      sendResponse(data);
    }).catch((err) => {
      alert(err);
    });
  }
  return true;
});
