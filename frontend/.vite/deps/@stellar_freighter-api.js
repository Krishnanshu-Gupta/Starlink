import {
  __commonJS
} from "./chunk-WOOG5QLI.js";

// node_modules/@stellar/freighter-api/build/index.min.js
var require_index_min = __commonJS({
  "node_modules/@stellar/freighter-api/build/index.min.js"(exports, module) {
    !function(e, r) {
      "object" == typeof exports && "object" == typeof module ? module.exports = r() : "function" == typeof define && define.amd ? define([], r) : "object" == typeof exports ? exports.freighterApi = r() : e.freighterApi = r();
    }(exports, () => (() => {
      "use strict";
      var e, r, o = { d: (e2, r2) => {
        for (var E2 in r2) o.o(r2, E2) && !o.o(e2, E2) && Object.defineProperty(e2, E2, { enumerable: true, get: r2[E2] });
      }, o: (e2, r2) => Object.prototype.hasOwnProperty.call(e2, r2), r: (e2) => {
        "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(e2, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(e2, "__esModule", { value: true });
      } }, E = {};
      o.r(E), o.d(E, { default: () => a, getNetwork: () => s, getNetworkDetails: () => N, getPublicKey: () => t, getUserInfo: () => i, isAllowed: () => C, isBrowser: () => R, isConnected: () => n, setAllowed: () => O, signAuthEntry: () => A, signBlob: () => S, signTransaction: () => _ }), function(e2) {
        e2.CREATE_ACCOUNT = "CREATE_ACCOUNT", e2.FUND_ACCOUNT = "FUND_ACCOUNT", e2.ADD_ACCOUNT = "ADD_ACCOUNT", e2.IMPORT_ACCOUNT = "IMPORT_ACCOUNT", e2.IMPORT_HARDWARE_WALLET = "IMPORT_HARDWARE_WALLET", e2.LOAD_ACCOUNT = "LOAD_ACCOUNT", e2.MAKE_ACCOUNT_ACTIVE = "MAKE_ACCOUNT_ACTIVE", e2.UPDATE_ACCOUNT_NAME = "UPDATE_ACCOUNT_NAME", e2.GET_MNEMONIC_PHRASE = "GET_MNEMONIC_PHRASE", e2.CONFIRM_MNEMONIC_PHRASE = "CONFIRM_MNEMONIC_PHRASE", e2.RECOVER_ACCOUNT = "RECOVER_ACCOUNT", e2.CONFIRM_PASSWORD = "CONFIRM_PASSWORD", e2.REJECT_ACCESS = "REJECT_ACCESS", e2.GRANT_ACCESS = "GRANT_ACCESS", e2.SIGN_TRANSACTION = "SIGN_TRANSACTION", e2.SIGN_BLOB = "SIGN_BLOB", e2.SIGN_AUTH_ENTRY = "SIGN_AUTH_ENTRY", e2.HANDLE_SIGNED_HW_TRANSACTION = "HANDLE_SIGNED_HW_TRANSACTION", e2.REJECT_TRANSACTION = "REJECT_TRANSACTION", e2.SIGN_FREIGHTER_TRANSACTION = "SIGN_FREIGHTER_TRANSACTION", e2.SIGN_FREIGHTER_SOROBAN_TRANSACTION = "SIGN_FREIGHTER_SOROBAN_TRANSACTION", e2.ADD_RECENT_ADDRESS = "ADD_RECENT_ADDRESS", e2.LOAD_RECENT_ADDRESSES = "LOAD_RECENT_ADDRESSES", e2.SIGN_OUT = "SIGN_OUT", e2.SHOW_BACKUP_PHRASE = "SHOW_BACKUP_PHRASE", e2.SAVE_ALLOWLIST = "SAVE_ALLOWLIST", e2.SAVE_SETTINGS = "SAVE_SETTINGS", e2.LOAD_SETTINGS = "LOAD_SETTINGS", e2.GET_CACHED_ASSET_ICON = "GET_CACHED_ASSET_ICON", e2.CACHE_ASSET_ICON = "CACHE_ASSET_ICON", e2.GET_CACHED_ASSET_DOMAIN = "GET_CACHED_ASSET_DOMAIN", e2.CACHE_ASSET_DOMAIN = "CACHE_ASSET_DOMAIN", e2.GET_BLOCKED_ACCOUNTS = "GET_BLOCKED_ACCOUNTS", e2.GET_BLOCKED_DOMAINS = "GET_BLOCKED_DOMAINS", e2.ADD_CUSTOM_NETWORK = "ADD_CUSTOM_NETWORK", e2.CHANGE_NETWORK = "CHANGE_NETWORK", e2.REMOVE_CUSTOM_NETWORK = "REMOVE_CUSTOM_NETWORK", e2.EDIT_CUSTOM_NETWORK = "EDIT_CUSTOM_NETWORK", e2.RESET_EXP_DATA = "RESET_EXP_DATA", e2.ADD_TOKEN_ID = "ADD_TOKEN_ID", e2.GET_TOKEN_IDS = "GET_TOKEN_IDS";
      }(e || (e = {})), function(e2) {
        e2.REQUEST_ACCESS = "REQUEST_ACCESS", e2.SUBMIT_TRANSACTION = "SUBMIT_TRANSACTION", e2.SUBMIT_BLOB = "SUBMIT_BLOB", e2.SUBMIT_AUTH_ENTRY = "SUBMIT_AUTH_ENTRY", e2.REQUEST_NETWORK = "REQUEST_NETWORK", e2.REQUEST_NETWORK_DETAILS = "REQUEST_NETWORK_DETAILS", e2.REQUEST_CONNECTION_STATUS = "REQUEST_CONNECTION_STATUS", e2.REQUEST_ALLOWED_STATUS = "REQUEST_ALLOWED_STATUS", e2.SET_ALLOWED_STATUS = "SET_ALLOWED_STATUS", e2.REQUEST_USER_INFO = "REQUEST_USER_INFO";
      }(r || (r = {}));
      const T = (e2) => {
        const o2 = Date.now() + Math.random();
        return window.postMessage({ source: "FREIGHTER_EXTERNAL_MSG_REQUEST", messageId: o2, ...e2 }, window.location.origin), new Promise((E2) => {
          let T2 = 0;
          e2.type === r.REQUEST_CONNECTION_STATUS && (T2 = setTimeout(() => {
            E2({ isConnected: false }), window.removeEventListener("message", t2);
          }, 2e3));
          const t2 = (e3) => {
            var r2, _2;
            e3.source === window && "FREIGHTER_EXTERNAL_MSG_RESPONSE" === (null === (r2 = null == e3 ? void 0 : e3.data) || void 0 === r2 ? void 0 : r2.source) && (null === (_2 = null == e3 ? void 0 : e3.data) || void 0 === _2 ? void 0 : _2.messagedId) === o2 && (E2(e3.data), window.removeEventListener("message", t2), clearTimeout(T2));
          };
          window.addEventListener("message", t2, false);
        });
      }, t = () => R ? (async () => {
        let e2 = { publicKey: "", error: "" };
        try {
          e2 = await T({ type: r.REQUEST_ACCESS });
        } catch (e3) {
          console.error(e3);
        }
        const { publicKey: o2, error: E2 } = e2;
        if (E2) throw E2;
        return o2;
      })() : Promise.resolve(""), _ = (e2, o2) => R ? (async (e3, o3, E2) => {
        let t2 = "", _2 = "", S2 = "";
        "object" == typeof o3 ? (t2 = o3.network || "", _2 = o3.accountToSign || "", S2 = o3.networkPassphrase || "") : (t2 = o3 || "", _2 = "");
        let A2 = { signedTransaction: "", error: "" };
        try {
          A2 = await T({ transactionXdr: e3, network: t2, networkPassphrase: S2, accountToSign: _2, type: r.SUBMIT_TRANSACTION });
        } catch (e4) {
          throw console.error(e4), e4;
        }
        const { signedTransaction: n2, error: s2 } = A2;
        if (s2) throw s2;
        return n2;
      })(e2, o2) : Promise.resolve(""), S = (e2, o2) => R ? (async (e3, o3) => {
        let E2 = { signedBlob: "", error: "" };
        const t2 = (o3 || {}).accountToSign || "";
        try {
          E2 = await T({ blob: e3, accountToSign: t2, type: r.SUBMIT_BLOB });
        } catch (e4) {
          throw console.error(e4), e4;
        }
        const { signedBlob: _2, error: S2 } = E2;
        if (S2) throw S2;
        return _2;
      })(e2, o2) : Promise.resolve(""), A = (e2, o2) => R ? (async (e3, o3) => {
        let E2 = { signedAuthEntry: "", error: "" };
        const t2 = (o3 || {}).accountToSign || "";
        try {
          E2 = await T({ entryXdr: e3, accountToSign: t2, type: r.SUBMIT_AUTH_ENTRY });
        } catch (e4) {
          console.error(e4);
        }
        const { signedAuthEntry: _2, error: S2 } = E2;
        if (S2) throw S2;
        return _2;
      })(e2, o2) : Promise.resolve(""), n = () => R ? window.freighter ? Promise.resolve(window.freighter) : (async () => {
        let e2 = { isConnected: false };
        try {
          e2 = await T({ type: r.REQUEST_CONNECTION_STATUS });
        } catch (e3) {
          console.error(e3);
        }
        return e2.isConnected;
      })() : Promise.resolve(false), s = () => R ? (async () => {
        let e2 = { network: "", error: "" };
        try {
          e2 = await T({ type: r.REQUEST_NETWORK });
        } catch (e3) {
          console.error(e3);
        }
        const { network: o2, error: E2 } = e2;
        if (E2) throw E2;
        return o2;
      })() : Promise.resolve(""), N = () => R ? (async () => {
        let e2 = { networkDetails: { network: "", networkName: "", networkUrl: "", networkPassphrase: "", sorobanRpcUrl: void 0 }, error: "" };
        try {
          e2 = await T({ type: r.REQUEST_NETWORK_DETAILS });
        } catch (e3) {
          console.error(e3);
        }
        const { networkDetails: o2, error: E2 } = e2, { network: t2, networkUrl: _2, networkPassphrase: S2, sorobanRpcUrl: A2 } = o2;
        if (E2) throw E2;
        return { network: t2, networkUrl: _2, networkPassphrase: S2, sorobanRpcUrl: A2 };
      })() : Promise.resolve({ network: "", networkUrl: "", networkPassphrase: "", sorobanRpcUrl: "" }), C = () => R ? (async () => {
        let e2 = { isAllowed: false };
        try {
          e2 = await T({ type: r.REQUEST_ALLOWED_STATUS });
        } catch (e3) {
          console.error(e3);
        }
        return e2.isAllowed;
      })() : Promise.resolve(false), O = () => R ? (async () => {
        let e2 = { isAllowed: false, error: "" };
        try {
          e2 = await T({ type: r.SET_ALLOWED_STATUS });
        } catch (e3) {
          console.error(e3);
        }
        const { isAllowed: o2, error: E2 } = e2;
        if (E2) throw E2;
        return o2;
      })() : Promise.resolve(false), i = () => R ? (async () => {
        let e2 = { userInfo: { publicKey: "" }, error: "" };
        try {
          e2 = await T({ type: r.REQUEST_USER_INFO });
        } catch (e3) {
          console.error(e3);
        }
        const { userInfo: o2, error: E2 } = e2;
        if (E2) throw E2;
        return o2;
      })() : Promise.resolve({ publicKey: "" }), R = "undefined" != typeof window, a = { getPublicKey: t, signTransaction: _, signBlob: S, signAuthEntry: A, isConnected: n, getNetwork: s, getNetworkDetails: N, isAllowed: C, setAllowed: O, getUserInfo: i };
      return E;
    })());
  }
});
export default require_index_min();
//# sourceMappingURL=@stellar_freighter-api.js.map
