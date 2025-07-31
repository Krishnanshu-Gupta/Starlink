import { useState } from "react";
import useEth from "../hooks/useEth";
import axios from "axios";

export default function LockEth() {
  const { address, signer, connect } = useEth();
  const [txHash,setTx]=useState("");

  async function handleLock() {
    await axios.post("http://localhost:3001/api/lock-eth", { from: address });
    // backend script locks ETH and returns tx
  }

  return (
    <div className="space-y-4">
      {!address && <button onClick={connect} className="btn">Connect MetaMask</button>}
      {address && <button onClick={handleLock} className="btn">Lock 0.01 ETH</button>}
      {txHash && <p>Tx: {txHash}</p>}
    </div>
  );
}