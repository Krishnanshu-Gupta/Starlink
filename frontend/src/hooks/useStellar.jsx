import { useState } from "react";
import { publicKeyAsync, signTransaction } from "@stellar/freighter-api";

export default function useStellar() {
  const [pub, setPub] = useState("");
  async function connect() {
    const p = await publicKeyAsync();
    setPub(p);
  }
  async function signXdr(xdr) {
    return signTransaction(xdr, { network: "TESTNET" });
  }
  return { pub, connect, signXdr };
}