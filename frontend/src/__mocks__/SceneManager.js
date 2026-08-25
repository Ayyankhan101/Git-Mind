import React from "react";

export default function SceneManager({ children, style, className }) {
  return (
    <div style={style} className={className}>
      {children?.({ prefersReduced: false })}
    </div>
  );
}
