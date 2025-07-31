import { useState } from "react";
import { ethers } from "ethers";

export default function useEth() {
  const [address, setAddress] = useState("");
  const [signer, setSigner] = useState(null);

  async function connect() {
    if (!window.ethereum) throw new Error("Install MetaMask");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const sign = await provider.getSigner();
    setSigner(sign);
    setAddress(await sign.getAddress());
  }
  return { address, signer, connect };
}