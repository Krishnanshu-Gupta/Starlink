import { NavLink, useLocation } from "react-router-dom";
const steps = [
  { path: "/lock-eth", label: "Lock ETH" },
  { path: "/lock-xlm", label: "Lock XLM" },
  { path: "/claim-xlm", label: "Claim XLM" }
];
export default function Stepper() {
  const { pathname } = useLocation();
  return (
    <div className="flex justify-center gap-4 mb-6">
      {steps.map(({ path, label }, i) => (
        <NavLink key={path} to={path} className={({ isActive }) =>
          `px-3 py-1 rounded-full text-sm ${isActive || pathname===path ? "bg-emerald-500" : "bg-gray-700"}`}>{i+1}. {label}</NavLink>
      ))}
    </div>
  );
}