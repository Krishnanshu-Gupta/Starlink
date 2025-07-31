import { Server, TransactionEnvelope } from "stellar-sdk";
import { sha256 } from "js-sha256";
import ethClaim from "./ethClaimer.js";
import dotenv from "dotenv";
dotenv.config();

const server = new Server("https://horizon-testnet.stellar.org");

export default function runWatcher() {
  const escrow = process.env.STELLAR_ESCROW;
  const hashHex = process.env.HASH_HEX;
  server.transactions().for_account(escrow).cursor("now").stream({
    onmessage: async tx => {
      const env = TransactionEnvelope.from_xdr(tx.envelope_xdr, "Test SDF Network ; September 2015");
      for (const sig of env.signatures) {
        const raw = sig.signature();
        if (raw.length === 32 && sha256(raw) === hashHex) {
          console.log("[Watcher] Preimage:", Buffer.from(raw).toString("hex"));
          await ethClaim(raw);
        }
      }
    }
  });
}