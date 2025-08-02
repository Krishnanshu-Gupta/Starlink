// Example LockEth.jsx
import { useState } from "react";
import { useWallet } from "../contexts/WalletContext";
import axios from "axios";

export default function LockEth() {
  const { ethWallet, connectEthWallet } = useWallet();
  const [txHash, setTx] = useState("");

  async function handleLock() {
    if (!ethWallet.address) return;
    const { data } = await axios.post("http://localhost:3001/api/lock-eth", { from: ethWallet.address });
    setTx(data.txHash || "Pending or unknown");
  }

  return (
    <div className="space-y-4">
      {!ethWallet.isConnected && (
        <button onClick={connectEthWallet} className="btn">
          Connect MetaMask
        </button>
      )}
      {ethWallet.isConnected && (
        <button onClick={handleLock} className="btn">
          Lock 0.01 ETH
        </button>
      )}
      {txHash && <p className="break-all">Tx: {txHash}</p>}
    </div>
  );
}
