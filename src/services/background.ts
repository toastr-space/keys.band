import { getEventHash, getPublicKey, getSignature, nip04 } from "nostr-tools";
import { domainToUrl, web } from "src/stores/utils";
import {
  loadPrivateKey,
  webSites,
  type WebSite,
  keyStore,
  loadWebSites,
  loadRelays,
} from "src/stores/key-store";
import { get } from "svelte/store";
import { escape } from "svelte/internal";

web.runtime.onInstalled.addListener(function (details) {
  loadPrivateKey();
});

web.runtime.onStartup.addListener(() => {
  loadPrivateKey();
});

let responders = {};

function createWindow(options) {
  return new Promise((resolve, reject) => {
    web.windows.create({
      url: web.runtime.getURL(options.action),
      width: 400,
      height: 500,
      type: "popup",
    });
  });
}

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
  data?: {}
) {
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

    site.history.push({
      accepted: duration.accept,
      type: type,
      data: data,
      created_at: new Date().toString(),
    });

    _webSites[domain] = site;

    await web.storage.local.set({ webSites: _webSites });
    return true;
  } else {
    site.auth = true;
    site.permission = {
      always: false,
      accept: duration.accept,
      reject: duration.reject,
      authorizationStop: duration.duration,
    };

    site.history.push({
      accepted: duration.accept,
      type: type,
      data: data,
      created_at: new Date().toString(),
    });

    _webSites[domain] = site;

    await web.storage.local.set({ webSites: _webSites });

    return true;
  }
}

async function makeResponse(type: string, data, domain: string) {
  await loadPrivateKey();
  let res;
  switch (type) {
    case "getPublicKey":
      res = getPublicKey(get(keyStore));
      break;
    case "getRelays":
      res = await loadRelays();
      res = res.map((relay) => {
        return { url: relay.url };
      });
      break;
    case "signEvent":
      res = data;
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
  console.log(res);
  return res;
}

async function manageResult(message, sender) {
  if (message.response !== undefined && message.response !== null) {
    if (responders[message.requestId]) {
      let responderData = responders[message.requestId];
      const domain = responderData.domain;
      let site;
      if (Object.keys(get(webSites)).indexOf(domain) === -1) {
        site = {
          auth: false,
          permission: {
            always: false,
            accept: true,
            reject: false,
          },
          history: [],
        };
      } else {
        site = get(webSites)[domain];
      }

      await updatePermission(
        message.response.permission,
        site,
        responderData.domain,
        responderData.type
      );

      if (message.response.error) {
        // update history
        let _webSites = get(webSites);
        let st = _webSites[domainToUrl(message.url)];
        let array = st.history || [];
        array.push({
          accepted: false,
          type: message.type,
          data: message.params,
          created_at: new Date().toString(),
        });
        st.history = array;
        _webSites[domainToUrl(message.url)] = st;
        await web.storage.local.set({ webSites: _webSites });
        await loadWebSites();

        responderData.resolve({
          id: message.requestId,
          type: responderData.type,
          ext: "nos2x",
          response: {
            error: {
              message: "User rejected the request",
              stack: "User rejected the request",
            },
          },
        });
        web.windows.remove(sender.tab.windowId);
        delete responders[message.requestId];
        return;
      }

      let res = await makeResponse(
        responderData.type,
        responderData.data,
        domain
      );

      responderData.resolve({
        id: message.requestId,
        type: responderData.type,
        ext: "nos2x",
        response: res,
      });
      web.windows.remove(sender.tab.windowId);
      delete responders[message.requestId];
    }
    return;
  }
}

async function manageRequest(message, sendResponse) {
  return new Promise(async (resolve, reject) => {
    await loadWebSites();
    let site;
    let resolved: boolean = false;
    await loadPrivateKey();
    if (get(keyStore) === "" || get(keyStore) === undefined) {
      resolved = true;
      resolve({
        id: message.id,
        type: message.type,
        ext: "nos2x",
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
      site = get(webSites)[domainToUrl(message.url)];
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
          let res = await makeResponse(
            message.type,
            message.params.event || message.params,
            domainToUrl(message.url)
          );
          // update history
          let _webSites = get(webSites);
          let st = _webSites[domainToUrl(message.url)];
          let array = st.history || [];
          array.push({
            accepted: true,
            type: message.type,
            data: message.params,
            created_at: new Date().toString(),
          });
          st.history = array;
          _webSites[domainToUrl(message.url)] = st;
          await web.storage.local.set({ webSites: _webSites });
          await loadWebSites();

          resolved = true;
          resolve({
            id: message.id,
            type: message.type,
            ext: "nos2x",
            response: res,
          });
          return;
        } else if (site.permission.accept && !site.permission.always) {
          if (new Date(site.permission.authorizationStop) > new Date()) {
            let res = await makeResponse(
              message.type,
              message.params.event || message.params,
              domainToUrl(message.url)
            );

            // update history
            let _webSites = get(webSites);
            let st = _webSites[domainToUrl(message.url)];
            let array = st.history || [];
            array.push({
              accepted: true,
              type: message.type,
              data: message.params.event || message.params,
              created_at: new Date().toString(),
            });
            st.history = array;
            _webSites[domainToUrl(message.url)] = st;
            await web.storage.local.set({ webSites: _webSites });
            await loadWebSites();

            resolved = true;
            resolve({
              id: message.id,
              type: message.type,
              ext: "nos2x",
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

              // update history
              let _webSites = get(webSites);
              let st = _webSites[domainToUrl(message.url)];
              let array = st.history || [];
              array.push({
                accepted: false,
                type: message.type,
                data: message.params,
                created_at: new Date().toString(),
              });
              st.history = array;
              _webSites[domainToUrl(message.url)] = st;
              await web.storage.local.set({ webSites: _webSites });
              await loadWebSites();

              resolve({
                id: message.id,
                type: message.type,
                ext: "nos2x",
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

    let accept = await new Promise(async () => {
      let options = {
        action:
          "popup.html?action=login&url=" +
          message.url +
          "&requestId=" +
          message.id +
          "&type=" +
          message.type +
          "&data=" +
          escape(JSON.stringify(message.params.event || message.params) || ""),
        id: message.id,
      };
      try {
        let res = await createWindow(options);
      } catch (e) {}
    });
  });
}

web.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.prompt) {
    manageResult(message, sender);
    sendResponse({ message: true }); // Assumant que manageResult n'est pas asynchrone.
  } else {
    manageRequest(message, sendResponse).then((data) => {
      sendResponse(data);
    });
  }
  return true; // Renvoie true pour indiquer une réponse asynchrone.
});
