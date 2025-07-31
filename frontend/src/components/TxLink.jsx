export default function TxLink({ hash, chain }) {
    if (!hash) return null;
    const url = chain === "eth"
      ? `https://sepolia.etherscan.io/tx/${hash}`
      : `https://stellar.expert/explorer/testnet/tx/${hash}`;
    return <a href={url} target="_blank" rel="noreferrer" className="underline text-blue-400">{hash.slice(0,10)}…</a>;
  }