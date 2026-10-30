import React from "react";
import { C } from "./lib";

/**
 * PAISLEY AI, traced from the character on the AI Literacy page (supplied screenshot s6,
 * geometry and colours sampled from it). Vector so it can blink and glance; the design
 * itself is unchanged.
 */
export const Robot: React.FC<{
  size: number;
  blink?: number; // 0 open .. 1 closed
  look?: number; // -1 left .. 1 right
  smile?: number; // 0..1 extra happiness
  backdrop?: number; // 0..1 the brand circles behind it
  style?: React.CSSProperties;
}> = ({ size, blink = 0, look = 0, smile = 0, backdrop = 1, style }) => {
  const eyeRy = 25 * (1 - blink * 0.9);
  const ex = look * 12;
  return (
    <svg viewBox="270 130 700 700" width={size} height={size} style={{ position: "absolute", overflow: "visible", ...style }}>
      <g opacity={backdrop}>
        <circle cx={575} cy={335} r={195} fill={C.brand} />
        <circle cx={760} cy={445} r={185} fill={C.brandSoft} />
        <circle cx={415} cy={532} r={132} fill={C.gold} />
        <rect x={575} y={540} width={290} height={265} rx={120} fill={C.brandDeep} />
      </g>
      {/* body */}
      <rect x={513} y={540} width={174} height={185} rx={48} fill="#fff" stroke="#dfe3ec" strokeWidth={8} />
      <rect x={560} y={590} width={80} height={68} rx={13} fill="#0b1226" />
      <text x={600} y={641} textAnchor="middle" fontFamily="Quicksand, sans-serif" fontWeight={700} fontSize={42} fill="#ffcc00">AI</text>
      {/* ears */}
      <circle cx={437} cy={386} r={33} fill="#fff" stroke="#dfe3ec" strokeWidth={7} />
      <circle cx={763} cy={386} r={33} fill="#fff" stroke="#dfe3ec" strokeWidth={7} />
      {/* head */}
      <rect x={437} y={249} width={326} height={275} rx={112} fill="#fff" stroke="#dfe3ec" strokeWidth={8} />
      <rect x={472} y={293} width={256} height={187} rx={74} fill="#0b1226" />
      {/* eyes and smile */}
      <ellipse cx={555 + ex} cy={378} rx={25} ry={eyeRy} fill="#ffcc00" />
      <ellipse cx={645 + ex} cy={378} rx={25} ry={eyeRy} fill="#ffcc00" />
      <path d={`M ${570 + ex} ${428 - smile * 3} Q ${600 + ex} ${448 + smile * 10} ${630 + ex} ${428 - smile * 3}`} fill="none"
        stroke="#ffcc00" strokeWidth={9} strokeLinecap="round" />
    </svg>
  );
};
