// Example LockXlm.jsx
import { useState } from "react";
import { useWallet } from "../contexts/WalletContext";
import axios from "axios";

export default function LockXlm() {
  const { stellarWallet, connectStellarWallet } = useWallet();
  const [hash, setHash] = useState("");

  async function handleLock() {
    if (!stellarWallet.address) return;
    const { data } = await axios.post("http://localhost:3001/api/lock-xlm", { pub: stellarWallet.address });
    setHash(data.hash);
  }

  return (
    <div className="space-y-4">
      {!stellarWallet.isConnected && (
        <button onClick={connectStellarWallet} className="btn">
          Connect Freighter
        </button>
      )}
      {stellarWallet.isConnected && (
        <button onClick={handleLock} className="btn">
          Lock 10 XLM
        </button>
      )}
      {hash && <p className="break-all">Hash: {hash}</p>}
    </div>
  );
}
