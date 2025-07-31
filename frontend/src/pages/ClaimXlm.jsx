import { useState } from "react";
import axios from "axios";

export default function ClaimXlm() {
  const [done,setDone]=useState(false);
  async function claim() {
    await axios.post("http://localhost:3001/api/claim-xlm");
    setDone(true);
  }
  return (
    <div className="space-y-4">
      <button onClick={claim} className="btn">Claim XLM</button>
      {done && <p>Claimed! Check Stellar explorer.</p>}
    </div>
  );
}