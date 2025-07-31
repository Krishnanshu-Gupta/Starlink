import { useState } from "react";
import useStellar from "../hooks/useStellar";
import axios from "axios";

export default function LockXlm() {
  const { pub, connect } = useStellar();
  const [hash,setHash]=useState("");

  async function lockXlm() {
    const { data } = await axios.post("http://localhost:3001/api/lock-xlm", { pub });
    setHash(data.hash);
  }

  return (
    <div className="space-y-4">
      {!pub && <button onClick={connect} className="btn">Connect Freighter</button>}
      {pub && <button onClick={lockXlm} className="btn">Lock 10 XLM</button>}
      {hash && <p>Hash: {hash}</p>}
    </div>
  );
}